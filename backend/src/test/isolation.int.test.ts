import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { PushSubscription } from '../models/PushSubscription'
import { setPushSender } from '../services/notificationService'

const available = await dbReachable()
type Actor = Awaited<ReturnType<typeof signedUpAgent>>

describe.skipIf(!available)('tenant isolation', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let alice: Actor
  let bob: Actor
  // ids of everything Alice owns
  const a: Record<string, string> = {}

  beforeAll(async () => {
    ctx = await startTestApp()
    alice = await signedUpAgent(ctx, 'alice@example.com')
    bob = await signedUpAgent(ctx, 'bob@example.com')

    a.thread = (await alice.agent.post('/api/threads').send({ name: 'Alice thread', category: 'Other', frequency: 'daily' })).body._id
    a.task = (await alice.agent.post('/api/tasks').send({ title: 'Alice task', threadId: a.thread })).body._id
    a.goal = (await alice.agent.post('/api/goals').send({ period: 'Q4-2026', text: 'Alice goal' })).body._id
    a.wish = (await alice.agent.post('/api/wishlist').send({ item: 'Alice wish' })).body._id
    a.drop = (await alice.agent.post('/api/drop').send({ type: 'text', textContent: 'alice secret' })).body._id
    await alice.agent.put('/api/settings').send({ timezone: 'Africa/Lagos' })
  })
  afterAll(async () => { await ctx.stop() })

  it('Alice sees her own data', async () => {
    for (const path of ['/api/threads', '/api/goals', '/api/wishlist', '/api/drop']) {
      expect((await alice.agent.get(path)).body.length, path).toBe(1)
    }
    expect((await alice.agent.get('/api/tasks')).body.some((t: any) => t._id === a.task)).toBe(true)
  })

  it('Bob sees none of it in any list', async () => {
    for (const path of ['/api/threads', '/api/goals', '/api/wishlist', '/api/drop']) {
      expect((await bob.agent.get(path)).body, path).toEqual([])
    }
    expect((await bob.agent.get('/api/tasks')).body).toEqual([])
    expect((await bob.agent.get('/api/settings')).body.timezone).toBe('UTC')
  })

  it('Bob cannot read, change or delete Alice’s records by id', async () => {
    const attempts: Array<[string, string, object?]> = [
      ['put', `/api/threads/${a.thread}`, { name: 'hacked' }],
      ['delete', `/api/threads/${a.thread}`],
      ['get', `/api/threads/${a.thread}/stats`],
      ['post', `/api/threads/${a.thread}/resources`, { title: 'x', url: 'https://x.example' }],
      ['put', `/api/tasks/${a.task}`, { title: 'hacked' }],
      ['patch', `/api/tasks/${a.task}/complete`],
      ['delete', `/api/tasks/${a.task}`],
      ['put', `/api/goals/${a.goal}`, { text: 'hacked' }],
      ['delete', `/api/goals/${a.goal}`],
      ['put', `/api/wishlist/${a.wish}`, { item: 'hacked' }],
      ['delete', `/api/wishlist/${a.wish}`],
      ['get', `/api/drop/${a.drop}/download-url`],
      ['patch', `/api/drop/${a.drop}`, { expiresAt: new Date(Date.now() + 1e9).toISOString() }],
      ['delete', `/api/drop/${a.drop}`],
    ]
    for (const [method, path, body] of attempts) {
      const res = await (bob.agent as any)[method](path).send(body)
      // Reads/updates are refused as "not found". Deletes are idempotent (so offline replays are safe), so they
      // may answer 200 — what matters is that nothing of Alice's changes, checked below.
      const allowed = method === 'delete' ? [200, 403, 404] : [403, 404]
      expect(allowed, `${method.toUpperCase()} ${path} → ${res.status}`).toContain(res.status)
    }
    // …and nothing of Alice's changed
    expect((await alice.agent.get('/api/threads')).body[0].name).toBe('Alice thread')
    expect((await alice.agent.get('/api/tasks')).body.find((t: any) => t._id === a.task)).toMatchObject({ title: 'Alice task', status: 'pending' })
    expect((await alice.agent.get('/api/goals')).body[0].text).toBe('Alice goal')
    expect((await alice.agent.get('/api/wishlist')).body[0].item).toBe('Alice wish')
    expect((await alice.agent.get('/api/drop')).body).toHaveLength(1)
  })

  it('Bob cannot attach his task to Alice’s thread', async () => {
    const res = await bob.agent.post('/api/tasks').send({ title: 'sneaky', threadId: a.thread })
    expect(res.status).toBe(400)
    const mine = await bob.agent.post('/api/tasks').send({ title: 'mine' })
    expect((await bob.agent.put(`/api/tasks/${mine.body._id}`).send({ threadId: a.thread })).status).toBe(400)
  })

  it('a client-chosen id can’t be used to take over or reveal someone else’s record', async () => {
    const res = await bob.agent.post('/api/goals').send({ _id: a.goal, period: 'Q1', text: 'Bob claims it' })
    expect(res.status).toBe(400)
    expect((await alice.agent.get('/api/goals')).body[0].text).toBe('Alice goal')
    // Bob's own replay is idempotent
    const id = new mongoose.Types.ObjectId().toString()
    const first = await bob.agent.post('/api/wishlist').send({ _id: id, item: 'Bob wish' })
    const again = await bob.agent.post('/api/wishlist').send({ _id: id, item: 'Bob wish' })
    expect([first.status, again.status]).toEqual([201, 201])
    expect((await bob.agent.get('/api/wishlist')).body).toHaveLength(1)
  })

  it('refuses Drop file keys that point outside the user’s own folder', async () => {
    const foreignKey = `drop/${alice.userId}/11111111-1111-1111-1111-111111111111-secret.pdf`
    const res = await bob.agent.post('/api/drop').send({ type: 'file', s3Key: foreignKey, fileName: 'secret.pdf', fileSize: 10, mimeType: 'application/pdf' })
    expect(res.status).toBe(400)
  })

  it('exports and analytics only cover the caller', async () => {
    const aliceExport = (await alice.agent.get('/api/export')).body
    expect(aliceExport.threads).toHaveLength(1)
    expect(aliceExport.tasks.every((t: any) => t.userId === alice.userId)).toBe(true)
    const bobExport = (await bob.agent.get('/api/export')).body
    expect(JSON.stringify(bobExport)).not.toContain('Alice')
    expect((await alice.agent.get('/api/analytics/summary')).body.totalThreads).toBe(1)
    expect((await bob.agent.get('/api/analytics/summary')).body.totalThreads).toBe(0)
    expect((await bob.agent.get('/api/analytics/threads')).body.threads).toEqual([])
  })

  it('generates each user’s day from their own threads only', async () => {
    // Alice's daily thread pulls her queued task onto today; Bob has no threads, so nothing is planned for him
    const mine = (await alice.agent.get('/api/tasks')).body
    expect(mine.find((t: any) => t._id === a.task)).toMatchObject({ scheduledBy: 'generator' })
    expect((await bob.agent.get('/api/tasks')).body.filter((t: any) => t.scheduledBy === 'generator')).toEqual([])
    expect(await Task.countDocuments({ userId: bob.userId, scheduledBy: 'generator' })).toBe(0)
  })

  it('push devices belong to one user; a shared device moves with the latest login', async () => {
    const sub = { endpoint: 'https://push.example/shared-device', keys: { p256dh: 'k', auth: 'a' } }
    expect((await alice.agent.post('/api/push/subscribe').send(sub)).status).toBe(201)
    expect((await bob.agent.post('/api/push/subscribe').send(sub)).status).toBe(201)
    const rows = await PushSubscription.find({ endpoint: sub.endpoint }).setOptions({ crossUser: true })
    expect(rows).toHaveLength(1)
    expect(String(rows[0].userId)).toBe(bob.userId)
    // Alice can't unsubscribe Bob's device
    await alice.agent.post('/api/push/unsubscribe').send({ endpoint: sub.endpoint })
    expect(await PushSubscription.countDocuments({ endpoint: sub.endpoint }).setOptions({ crossUser: true })).toBe(1)
  })

  it('push notifications only reach the owner’s devices', async () => {
    process.env.VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
    const sent: string[] = []
    setPushSender(async sub => { sent.push(sub.endpoint) })
    await alice.agent.post('/api/push/subscribe').send({ endpoint: 'https://push.example/alice-phone', keys: { p256dh: 'k', auth: 'a' } })
    const res = await alice.agent.post('/api/push/test')
    expect(res.status).toBe(200)
    expect(sent).toEqual(['https://push.example/alice-phone'])
    setPushSender(null)
  })

  it('bulk inserts work, and refuse documents without a user', async () => {
    const docs = [{ userId: alice.userId, title: 'bulk 1' }, { userId: alice.userId, title: 'bulk 2' }]
    await expect(Task.insertMany(docs)).resolves.toHaveLength(2)
    await expect(Task.insertMany([{ userId: alice.userId, title: 'ok' }, { title: 'orphan' }])).rejects.toThrow(/need a userId/)
    expect(await Task.countDocuments({ userId: alice.userId, title: 'orphan' })).toBe(0)
  })

  it('refuses any query that forgets the user filter', async () => {
    await expect(Thread.find({})).rejects.toThrow(/Tenant guard/)
    await expect(Task.findOne({ title: 'Alice task' })).rejects.toThrow(/Tenant guard/)
    await expect(Task.updateMany({}, { title: 'x' })).rejects.toThrow(/Tenant guard/)
    await expect(Task.deleteMany({})).rejects.toThrow(/Tenant guard/)
    await expect(Task.countDocuments({})).rejects.toThrow(/Tenant guard/)
    await expect(Task.findOne({ userId: undefined } as any)).rejects.toThrow(/Tenant guard/)
    await expect(Task.find({ userId: { $ne: alice.userId } } as any)).rejects.toThrow(/Tenant guard/)
  })
})
