import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent, newInvite } from './harness'
import { User } from '../models/User'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'
import { DropItem } from '../models/DropItem'
import { Settings } from '../models/Settings'
import { PushSubscription } from '../models/PushSubscription'
import { ApiToken } from '../models/ApiToken'
import { InviteCode } from '../models/InviteCode'
import { AuditLog } from '../models/AuditLog'
import { Routine } from '../models/Routine'
import { FocusSession } from '../models/FocusSession'
import { Habit } from '../models/Habit'
import { HabitLog } from '../models/HabitLog'
import { Workout } from '../models/Workout'
import { StepDay } from '../models/StepDay'
import { BodyMetric } from '../models/BodyMetric'
import { Meal } from '../models/Meal'

const available = await dbReachable()
const PASSWORD = 'correct horse battery'

describe.skipIf(!available)('account export/deletion and admin area', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { await ctx.stop() })

  const fill = async (userId: string) => {
    const t = await Thread.create({ userId, name: 'Mine', category: 'Other', frequency: 'daily', taskMode: 'continuous' })
    await Task.create({ userId, title: 'a task', threadId: t._id })
    await Goal.create({ userId, period: 'Q4-2026', text: 'a goal' })
    await WishlistItem.create({ userId, item: 'a wish' })
    await DropItem.create({ userId, type: 'text', textContent: 'note', expiresAt: new Date(Date.now() + 86_400_000) })
    await PushSubscription.create({ userId, endpoint: `https://push.example/${userId}`, keys: { p256dh: 'k', auth: 'a' } })
    await Routine.create({ userId, name: 'Morning', weekdays: [1], items: [{ id: 'a', title: 'Stretch' }] })
    await FocusSession.create({ userId, startedAt: new Date(), minutes: 25 })
    const habit = await Habit.create({ userId, name: 'Read', startedOn: '2026-10-01' })
    await HabitLog.create({ userId, habitId: habit._id, day: '2026-10-02', value: 1 })
    await Workout.create({ userId, day: '2026-10-02', title: 'Run' })
    await StepDay.create({ userId, day: '2026-10-02', manual: 5000 })
    await BodyMetric.create({ userId, day: '2026-10-02', weightKg: 70 })
    await Meal.create({ userId, day: '2026-10-02', slot: 'lunch', text: 'Rice', calories: 300, proteinG: 6, carbsG: 65, fatG: 1 })
    await ApiToken.create({ userId, tokenHash: `h${userId}`, label: 'x', expiresAt: new Date(Date.now() + 1e9) })
  }
  const holdings = async (userId: string) => (await Promise.all([
    Thread.countDocuments({ userId }), Task.countDocuments({ userId }), DropItem.countDocuments({ userId }),
    Settings.countDocuments({ userId }), PushSubscription.countDocuments({ userId }), ApiToken.countDocuments({ userId }),
    Goal.countDocuments({ userId }), WishlistItem.countDocuments({ userId }),
    Routine.countDocuments({ userId }), FocusSession.countDocuments({ userId }), Habit.countDocuments({ userId }), HabitLog.countDocuments({ userId }),
    Workout.countDocuments({ userId }), StepDay.countDocuments({ userId }), BodyMetric.countDocuments({ userId }), Meal.countDocuments({ userId }),
  ])).reduce((a, b) => a + b, 0)

  describe('export', () => {
    it('contains only the caller’s own data, with no secrets', async () => {
      const a = await signedUpAgent(ctx, 'exp-a@example.com')
      const b = await signedUpAgent(ctx, 'exp-b@example.com')
      await fill(a.userId); await fill(b.userId)
      const res = await a.agent.get('/api/account/export')
      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toMatch(/attachment/)
      expect(res.body.profile.email).toBe('exp-a@example.com')
      expect(res.body.threads).toHaveLength(1)
      expect(res.body.tasks).toHaveLength(1)
      expect(res.body.drop).toHaveLength(1)
      expect(res.body.drop[0].s3Key).toBeUndefined()
      const text = JSON.stringify(res.body)
      expect(text).not.toContain(b.userId)
      expect(text).not.toMatch(/passwordHash|tokenHash|exp-b@/)
      expect((await request(ctx.app).get('/api/account/export')).status).toBe(401)
    })
  })

  describe('delete my account', () => {
    it('needs the typed email and the password, then erases everything and logs out', async () => {
      const a = await signedUpAgent(ctx, 'del-a@example.com')
      const b = await signedUpAgent(ctx, 'del-b@example.com')
      await fill(a.userId); await fill(b.userId)
      const keep = await holdings(b.userId)

      expect((await a.agent.post('/api/account/delete').send({ confirmEmail: 'wrong@example.com', password: PASSWORD })).status).toBe(400)
      expect((await a.agent.post('/api/account/delete').send({ confirmEmail: 'del-a@example.com', password: 'not the password' })).status).toBe(403)
      expect((await a.agent.post('/api/account/delete').send({ confirmEmail: 'del-a@example.com' })).status).toBe(403)
      expect(await User.exists({ _id: a.userId })).toBeTruthy()

      const done = await a.agent.post('/api/account/delete').send({ confirmEmail: 'DEL-A@example.com ', password: PASSWORD })
      expect(done.status).toBe(200)
      expect(await User.exists({ _id: a.userId })).toBeNull()
      expect(await holdings(a.userId)).toBe(0)
      expect((await a.agent.get('/api/threads')).status).toBe(401)
      // can't sign in again; email is free to register
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'del-a@example.com', password: PASSWORD })).status).toBe(401)
      // the other account is untouched
      expect(await holdings(b.userId)).toBe(keep)
      expect((await b.agent.get('/api/threads')).status).toBe(200)
    })

    it('a Google-only account confirms with its email alone', async () => {
      const g = await signedUpAgent(ctx, 'del-g@example.com')
      await User.updateOne({ _id: g.userId }, { $set: { passwordHash: null } })
      expect((await g.agent.post('/api/account/delete').send({ confirmEmail: 'del-g@example.com' })).status).toBe(200)
      expect(await User.exists({ _id: g.userId })).toBeNull()
    })

    it('admins cannot delete themselves here', async () => {
      const boss = await signedUpAgent(ctx, 'del-boss@example.com')
      await User.updateOne({ _id: boss.userId }, { $set: { role: 'admin' } })
      expect((await boss.agent.post('/api/account/delete').send({ confirmEmail: 'del-boss@example.com', password: PASSWORD })).status).toBe(403)
    })
  })

  describe('admin area', () => {
    let admin: Awaited<ReturnType<typeof signedUpAgent>>
    let member: Awaited<ReturnType<typeof signedUpAgent>>
    beforeAll(async () => {
      admin = await signedUpAgent(ctx, 'admin@example.com')
      await User.updateOne({ _id: admin.userId }, { $set: { role: 'admin' } })
      // role is read per request, so the existing session is now an admin session
      member = await signedUpAgent(ctx, 'member@example.com')
      await fill(member.userId)
    })

    it('is closed to everyone but admins', async () => {
      expect((await request(ctx.app).get('/api/admin/stats')).status).toBe(401)
      for (const path of ['/api/admin/stats', '/api/admin/users', '/api/admin/invites', '/api/admin/audit']) {
        expect((await member.agent.get(path)).status).toBe(403)
      }
      expect((await member.agent.post('/api/admin/invites').send({ count: 1, uses: 1, days: 0 })).status).toBe(403)
      expect((await member.agent.delete(`/api/admin/users/${admin.userId}`)).status).toBe(403)
    })

    it('shows stats and a searchable user list with usage', async () => {
      const stats = (await admin.agent.get('/api/admin/stats')).body
      expect(stats.users.total).toBeGreaterThanOrEqual(2)
      const list = (await admin.agent.get('/api/admin/users?q=member@')).body
      expect(list.users).toHaveLength(1)
      expect(list.users[0]).toMatchObject({ email: 'member@example.com', status: 'active', threads: 1, tasks: 1, emailVerified: true })
      expect(list.users[0].passwordHash).toBeUndefined()
      expect((await admin.agent.get('/api/admin/users?page=abc')).status).toBe(400)
      // regex characters in a search are literal
      expect((await admin.agent.get('/api/admin/users?q=.*')).body.users).toHaveLength(0)
    })

    it('suspends (signing them out everywhere) and restores a user, and logs it', async () => {
      const victim = await signedUpAgent(ctx, 'victim@example.com')
      expect((await victim.agent.get('/api/threads')).status).toBe(200)
      expect((await admin.agent.post(`/api/admin/users/${victim.userId}/suspend`)).status).toBe(200)
      expect((await victim.agent.get('/api/threads')).status).toBe(401)
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'victim@example.com', password: PASSWORD })).status).toBe(403)
      expect((await admin.agent.post(`/api/admin/users/${victim.userId}/unsuspend`)).status).toBe(200)
      expect((await request(ctx.app).post('/api/auth/login').send({ email: 'victim@example.com', password: PASSWORD })).status).toBe(200)
      const audit = (await admin.agent.get('/api/admin/audit')).body.map((r: any) => r.action)
      expect(audit).toEqual(expect.arrayContaining(['suspend', 'unsuspend']))
    })

    it('protects admins and the caller; deletes others completely', async () => {
      expect((await admin.agent.post(`/api/admin/users/${admin.userId}/suspend`)).status).toBe(400)
      const other = await signedUpAgent(ctx, 'other-admin@example.com')
      await User.updateOne({ _id: other.userId }, { $set: { role: 'admin' } })
      expect((await admin.agent.delete(`/api/admin/users/${other.userId}`)).status).toBe(400)
      expect((await admin.agent.delete('/api/admin/users/not-an-id')).status).toBe(400)
      expect((await admin.agent.delete('/api/admin/users/ffffffffffffffffffffffff')).status).toBe(404)

      expect((await admin.agent.delete(`/api/admin/users/${member.userId}`)).status).toBe(200)
      expect(await User.exists({ _id: member.userId })).toBeNull()
      expect(await holdings(member.userId)).toBe(0)
      const row = await AuditLog.findOne({ action: 'delete' })
      expect(String(row!.targetUserId)).toBe(member.userId)
    })

    it('creates, lists and revokes invite codes that really gate sign-up', async () => {
      const made = await admin.agent.post('/api/admin/invites').send({ count: 2, uses: 3, days: 7, note: 'testers' })
      expect(made.status).toBe(201)
      expect(made.body).toHaveLength(2)
      const code = made.body[0].code
      const list = (await admin.agent.get('/api/admin/invites')).body
      expect(list.find((c: any) => c.code === code)).toMatchObject({ maxUses: 3, remaining: 3, note: 'testers' })
      expect((await admin.agent.post('/api/admin/invites').send({ count: 999, uses: 1, days: 0 })).status).toBe(400)

      const signupWith = (email: string) => request(ctx.app).post('/api/auth/signup').send({ email, password: PASSWORD, inviteCode: code, acceptTerms: true })
      expect((await signupWith('inv1@example.com')).status).toBe(200)
      const id = list.find((c: any) => c.code === code).id
      expect((await admin.agent.post(`/api/admin/invites/${id}/revoke`)).status).toBe(200)
      expect((await signupWith('inv2@example.com')).status).toBe(400)
      expect((await admin.agent.post(`/api/admin/invites/${id}/revoke`)).status).toBe(404)
      expect((await InviteCode.findById(id))!.revokedAt).toBeTruthy()
    })
  })
})
