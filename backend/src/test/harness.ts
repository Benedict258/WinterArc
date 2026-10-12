import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../../../server'
import { InviteCode } from '../models/InviteCode'
import { setEmailTransport, type Email } from '../services/emailService'
import { resetRateLimits } from '../routes/auth'

// Integration tests need a MongoDB-compatible server. Locally: FerretDB or mongod on
// TEST_MONGO_URI (default mongodb://127.0.0.1:27018). CI provides a mongo service.
// Without one, the suites skip instead of failing.
const BASE = (process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27018').replace(/\/$/, '')

export async function dbReachable() {
  const probe = mongoose.createConnection(`${BASE}/probe`, { serverSelectionTimeoutMS: 1500 })
  try {
    await probe.asPromise()
    return true
  } catch {
    return false
  } finally {
    await probe.close().catch(() => {})
  }
}

export async function startTestApp() {
  const dbName = `winterarc_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  await mongoose.connect(`${BASE}/${dbName}`)
  await mongoose.syncIndexes().catch(() => {})
  const outbox: Email[] = []
  setEmailTransport(async e => { outbox.push(e) })
  resetRateLimits()
  const app = createApp()
  return {
    app,
    outbox,
    async stop() {
      await mongoose.connection.dropDatabase().catch(() => {})
      await mongoose.disconnect()
      setEmailTransport(null)
    },
  }
}

export const tokenFrom = (email: Email) => /token=([0-9a-f]+)/.exec(email.text)![1]

export async function newInvite(uses = 100) {
  const doc = await InviteCode.create({ code: `T-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, maxUses: uses, remaining: uses })
  return doc.code
}

/** Signs up (with an invite) and returns a cookie-carrying agent plus the user's id. */
export async function signedUpAgent(ctx: Awaited<ReturnType<typeof startTestApp>>, email: string, opts: { verify?: boolean } = {}) {
  const agent = request.agent(ctx.app)
  const res = await agent.post('/api/auth/signup').send({ email, password: 'correct horse battery', inviteCode: await newInvite(), timezone: 'UTC' })
  if (res.status !== 200) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`)
  if (opts.verify !== false) {
    const mail = [...ctx.outbox].reverse().find(m => m.to === email && /verify-email/.test(m.text))!
    await request(ctx.app).post('/api/auth/verify-email').send({ token: tokenFrom(mail) })
  }
  return { agent, userId: res.body.user.id as string, email }
}
