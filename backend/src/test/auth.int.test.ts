import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { dbReachable, startTestApp, tokenFrom, newInvite } from './harness'
import { User } from '../models/User'
import { InviteCode } from '../models/InviteCode'
import { setGoogleVerifier } from '../services/authService'
import { TERMS_VERSION } from '../../../src/shared/legal'

const available = await dbReachable()
const PASSWORD = 'correct horse battery'

describe.skipIf(!available)('auth', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { await ctx.stop() })

  const signup = (body: Record<string, unknown>) => request(ctx.app).post('/api/auth/signup').send({ acceptTerms: true, ...body })

  describe('sign-up and invites', () => {
    it('requires accepting the terms', async () => {
      const res = await request(ctx.app).post('/api/auth/signup').send({ email: 'terms@example.com', password: PASSWORD, inviteCode: await newInvite() })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/terms/i)
      expect(await User.exists({ email: 'terms@example.com' })).toBeNull()
      const ok = await signup({ email: 'terms@example.com', password: PASSWORD, inviteCode: await newInvite() })
      expect(ok.status).toBe(200)
      const u = await User.findOne({ email: 'terms@example.com' })
      expect(u!.termsAcceptedAt).toBeTruthy()
      expect(u!.termsVersion).toBe(TERMS_VERSION)
      process.env.LEGAL_NAME = 'Acme Ltd'
      process.env.LEGAL_JURISDICTION = 'Nigeria'
      const config = (await request(ctx.app).get('/api/auth/config')).body
      expect(config).toMatchObject({ legalName: 'Acme Ltd', jurisdiction: 'Nigeria', termsVersion: TERMS_VERSION })
      delete process.env.LEGAL_NAME; delete process.env.LEGAL_JURISDICTION
    })

    it('needs an invite code during the beta', async () => {
      const res = await signup({ email: 'a@example.com', password: PASSWORD })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('invite_required')
    })

    it('rejects unknown codes and weak passwords', async () => {
      expect((await signup({ email: 'a@example.com', password: PASSWORD, inviteCode: 'NOPE' })).body.code).toBe('invite_invalid')
      const weak = await signup({ email: 'a@example.com', password: 'short', inviteCode: await newInvite() })
      expect(weak.status).toBe(400)
      expect(weak.body.code).toBe('weak_password')
    })

    it('creates the account, signs in, and sends a verification email', async () => {
      const agent = request.agent(ctx.app)
      const res = await agent.post('/api/auth/signup').send({ acceptTerms: true, email: 'New@Example.com', password: PASSWORD, inviteCode: await newInvite(), name: 'Nia' })
      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ email: 'new@example.com', emailVerified: false, role: 'user' })
      expect((await agent.get('/api/auth/me')).body.authenticated).toBe(true)
      const mail = ctx.outbox.find(m => m.to === 'new@example.com')!
      expect(mail.subject).toMatch(/confirm/i)

      const verified = await request(ctx.app).post('/api/auth/verify-email').send({ token: tokenFrom(mail) })
      expect(verified.status).toBe(200)
      expect(verified.body.user.emailVerified).toBe(true)
      // a link works once
      expect((await request(ctx.app).post('/api/auth/verify-email').send({ token: tokenFrom(mail) })).status).toBe(400)
    })

    it('counts invite uses and refuses a used-up code', async () => {
      const code = await newInvite(1)
      expect((await signup({ email: 'one@example.com', password: PASSWORD, inviteCode: code })).status).toBe(200)
      expect((await signup({ email: 'two@example.com', password: PASSWORD, inviteCode: code })).body.code).toBe('invite_invalid')
    })

    it('does not burn an invite when the email is already registered', async () => {
      const code = await newInvite(1)
      const dup = await signup({ email: 'one@example.com', password: PASSWORD, inviteCode: code })
      expect(dup.status).toBe(409)
      expect((await InviteCode.findOne({ code }))!.remaining).toBe(1)
    })

    it('respects revoked and expired codes', async () => {
      const revoked = await newInvite()
      await InviteCode.updateOne({ code: revoked }, { revokedAt: new Date() })
      const expired = await newInvite()
      await InviteCode.updateOne({ code: expired }, { expiresAt: new Date(Date.now() - 1000) })
      expect((await signup({ email: 'r@example.com', password: PASSWORD, inviteCode: revoked })).body.code).toBe('invite_invalid')
      expect((await signup({ email: 'e@example.com', password: PASSWORD, inviteCode: expired })).body.code).toBe('invite_invalid')
    })

    it('creates default settings with the timezone given at sign-up', async () => {
      const res = await signup({ email: 'tz@example.com', password: PASSWORD, inviteCode: await newInvite(), timezone: 'Africa/Lagos' })
      const agent = request.agent(ctx.app)
      await agent.post('/api/auth/login').send({ email: 'tz@example.com', password: PASSWORD })
      expect((await agent.get('/api/settings')).body.timezone).toBe('Africa/Lagos')
      expect(res.status).toBe(200)
    })
  })

  describe('login', () => {
    it('rejects wrong passwords and unknown emails the same way', async () => {
      const bad = await request(ctx.app).post('/api/auth/login').send({ email: 'one@example.com', password: 'wrong password!!' })
      const ghost = await request(ctx.app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'wrong password!!' })
      expect(bad.status).toBe(401)
      expect(ghost.status).toBe(401)
      expect(bad.body.error).toBe(ghost.body.error)
    })

    it('logs in and out', async () => {
      const agent = request.agent(ctx.app)
      expect((await agent.post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD })).status).toBe(200)
      expect((await agent.get('/api/threads')).status).toBe(200)
      await agent.post('/api/auth/logout')
      expect((await agent.get('/api/threads')).status).toBe(401)
    })

    it('gives the native app a bearer token that works and can be revoked', async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD, client: 'native' })
      expect(res.body.token).toMatch(/^[0-9a-f]{64}$/)
      const auth = { Authorization: `Bearer ${res.body.token}` }
      expect((await request(ctx.app).get('/api/threads').set(auth)).status).toBe(200)
      await request(ctx.app).post('/api/auth/logout').set(auth)
      expect((await request(ctx.app).get('/api/threads').set(auth)).status).toBe(401)
    })

    it('locks the account after repeated failures, even for the right password', async () => {
      await signup({ email: 'lock@example.com', password: PASSWORD, inviteCode: await newInvite() })
      for (let i = 0; i < 8; i++) await request(ctx.app).post('/api/auth/login').send({ email: 'lock@example.com', password: 'nope nope nope' })
      const res = await request(ctx.app).post('/api/auth/login').send({ email: 'lock@example.com', password: PASSWORD })
      expect(res.status).toBe(429)
    })

    it('locks out suspended users immediately, including existing sessions', async () => {
      const agent = request.agent(ctx.app)
      await agent.post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD })
      expect((await agent.get('/api/threads')).status).toBe(200)
      await User.updateOne({ email: 'one@example.com' }, { status: 'suspended' })
      expect((await agent.get('/api/threads')).status).toBe(401)
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD })).status).toBe(403)
      await User.updateOne({ email: 'one@example.com' }, { status: 'active' })
    })

    it('requires login for the API', async () => {
      for (const path of ['/api/threads', '/api/tasks', '/api/settings', '/api/export', '/api/drop', '/api/analytics/summary']) {
        expect((await request(ctx.app).get(path)).status).toBe(401)
      }
    })
  })

  describe('password reset', () => {
    it('emails a link, sets a new password, and signs out old sessions', async () => {
      const old = request.agent(ctx.app)
      await old.post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD })

      ctx.outbox.length = 0
      expect((await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'one@example.com' })).status).toBe(200)
      const mail = ctx.outbox.find(m => /reset-password/.test(m.text))!
      const token = tokenFrom(mail)

      expect((await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'short' })).body.code).toBe('weak_password')
      expect((await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'a brand new passphrase' })).status).toBe(200)
      expect((await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'another passphrase here' })).status).toBe(400) // single use

      expect((await old.get('/api/threads')).status).toBe(401)
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'one@example.com', password: PASSWORD })).status).toBe(401)
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'one@example.com', password: 'a brand new passphrase' })).status).toBe(200)
    })

    it('gives the same answer for unknown emails and sends nothing', async () => {
      ctx.outbox.length = 0
      const res = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' })
      expect(res.status).toBe(200)
      expect(ctx.outbox).toHaveLength(0)
    })
  })

  describe('Google', () => {
    const fake = (email: string, verified = true) => async (credential: string) => ({ sub: `sub-${credential}`, email, name: 'G User', emailVerified: verified })

    it('creates an account with an invite, verified and signed in', async () => {
      setGoogleVerifier(fake('g@example.com'))
      expect((await request(ctx.app).post('/api/auth/google').send({ credential: 'tokentokentoken', acceptTerms: true })).body.code).toBe('invite_required')
      expect((await request(ctx.app).post('/api/auth/google').send({ credential: 'tokentokentoken', inviteCode: await newInvite() })).body.code).toBe('terms_required')
      const res = await request(ctx.app).post('/api/auth/google').send({ credential: 'tokentokentoken', inviteCode: await newInvite(), acceptTerms: true })
      expect(res.status).toBe(200)
      expect(res.body.user).toMatchObject({ email: 'g@example.com', emailVerified: true })
    })

    it('signs an existing Google user in without a new invite', async () => {
      setGoogleVerifier(fake('g@example.com'))
      expect((await request(ctx.app).post('/api/auth/google').send({ credential: 'tokentokentoken' })).status).toBe(200)
    })

    it('links Google to an existing email account and refuses unverified Google emails', async () => {
      setGoogleVerifier(fake('lock@example.com'))
      expect((await request(ctx.app).post('/api/auth/google').send({ credential: 'linkmelinkmelink' })).status).toBe(200)
      setGoogleVerifier(fake('fresh@example.com', false))
      expect((await request(ctx.app).post('/api/auth/google').send({ credential: 'unverifiedtoken1', inviteCode: await newInvite() })).status).toBe(401)
    })
  })

  describe('admin and verification gates', () => {
    it('makes the configured admin email an admin once verified', async () => {
      process.env.ADMIN_EMAIL = 'boss@example.com'
      await signup({ email: 'boss@example.com', password: PASSWORD, inviteCode: await newInvite() })
      const user = await User.findOne({ email: 'boss@example.com' })
      expect(user!.role).toBe('admin')
      delete process.env.ADMIN_EMAIL
    })

    it('keeps push and test notifications for verified users', async () => {
      const agent = request.agent(ctx.app)
      await agent.post('/api/auth/signup').send({ acceptTerms: true, email: 'unverified@example.com', password: PASSWORD, inviteCode: await newInvite() })
      const res = await agent.post('/api/push/subscribe').send({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('email_unverified')
    })
  })

  it('never stores passwords or tokens in clear text', async () => {
    const user = await User.findOne({ email: 'one@example.com' })
    expect(user!.passwordHash).toMatch(/^scrypt\$/)
    expect(JSON.stringify(user)).not.toContain(PASSWORD)
    const tokens = await mongoose.connection.collection('emailtokens').find().toArray()
    for (const t of tokens) expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
