import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { setStorage, type Storage } from '../services/s3'
import { sweepDrop, resetSweepClock } from '../services/dropService'
import { effectivePlan } from '../services/planService'
import { DropItem } from '../models/DropItem'
import { Thread } from '../models/Thread'
import { User } from '../models/User'
import { Task } from '../models/Task'

const available = await dbReachable()
const MB = 1024 * 1024
const HOUR = 3600_000

/** In-memory object storage. */
function fakeStorage() {
  const objects = new Map<string, { size: number; lastModified: Date }>()
  const storage: Storage = {
    presignPut: async key => `https://storage.test/put/${key}`,
    presignGet: async key => `https://storage.test/get/${key}`,
    remove: async key => { objects.delete(key) },
    head: async key => (objects.has(key) ? { size: objects.get(key)!.size } : null),
    list: async (prefix, token) => {
      const all = [...objects.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.key.localeCompare(b.key))
      const start = token ? Number(token) : 0
      const page = all.slice(start, start + 2) // tiny pages to exercise paging
      return { objects: page, next: start + 2 < all.length ? String(start + 2) : undefined }
    },
  }
  return { objects, storage }
}

describe.skipIf(!available)('Drop limits and plans', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let fake = fakeStorage()
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { setStorage(null); await ctx.stop() })
  beforeEach(() => { fake = fakeStorage(); setStorage(fake.storage); resetSweepClock() })
  afterEach(() => { for (const k of ['DROP_QUOTA_MB', 'DROP_MAX_FILE_MB', 'DROP_MAX_ITEMS', 'MAX_THREADS_FREE']) delete process.env[k] })

  const upload = (agent: any, size: number, name = 'f.bin') => agent.post('/api/drop/upload-url').send({ fileName: name, mimeType: 'application/octet-stream', fileSize: size })
  /** What the browser does: ask for an address, put the bytes there, register the file. */
  async function drop(agent: any, claimed: number, actual = claimed, name = 'f.bin') {
    const meta = await upload(agent, claimed, name)
    if (meta.status !== 200) return meta
    fake.objects.set(meta.body.s3Key, { size: actual, lastModified: new Date() })
    return agent.post('/api/drop').send({ type: 'file', s3Key: meta.body.s3Key, fileName: name, fileSize: claimed, mimeType: 'application/octet-stream' })
  }

  it('reports usage and limits, and the plan rules', async () => {
    const a = await signedUpAgent(ctx, 'drop-a@example.com')
    await drop(a.agent, 3 * MB)
    const status = (await a.agent.get('/api/drop/status')).body
    expect(status.storageConfigured).toBe(true)
    expect(status.usage).toMatchObject({ plan: 'free', usedBytes: 3 * MB, items: 1, quotaBytes: 200 * MB, maxFileBytes: 25 * MB })
    expect(effectivePlan(null)).toBe('free')
    expect(effectivePlan({ plan: 'pro', planExpiresAt: new Date(Date.now() + 1000) })).toBe('pro')
    expect(effectivePlan({ plan: 'pro', planExpiresAt: new Date(Date.now() - 1000) })).toBe('free')
    expect(effectivePlan({ plan: 'pro', planExpiresAt: null })).toBe('pro')
  })

  it('refuses files over the size limit or that would pass the storage quota', async () => {
    process.env.DROP_MAX_FILE_MB = '4'
    process.env.DROP_QUOTA_MB = '6'
    const a = await signedUpAgent(ctx, 'drop-q@example.com')
    const tooBig = await upload(a.agent, 5 * MB)
    expect(tooBig.status).toBe(413)
    expect(tooBig.body.error).toMatch(/up to 4 MB/)
    expect((await drop(a.agent, 4 * MB)).status).toBe(201)
    const full = await upload(a.agent, 3 * MB)
    expect(full.status).toBe(413)
    expect(full.body.error).toMatch(/6 MB Drop storage/)
    expect((await drop(a.agent, 2 * MB)).status).toBe(201) // exactly fits
    expect((await upload(a.agent, 1)).status).toBe(413)
  })

  it('measures the stored file, not the size the browser claims', async () => {
    process.env.DROP_MAX_FILE_MB = '4'
    const a = await signedUpAgent(ctx, 'drop-lie@example.com')
    const lied = await drop(a.agent, 1000, 30 * MB, 'huge.bin')
    expect(lied.status).toBe(413)
    expect(fake.objects.size).toBe(0) // the oversize object was deleted
    expect(await DropItem.countDocuments({ userId: a.userId })).toBe(0)
    const honest = await drop(a.agent, 1000, 2 * MB)
    expect(honest.status).toBe(201)
    expect(honest.body.fileSize).toBe(2 * MB) // storage's number wins
  })

  it('rejects files that never arrived, repeats, and keys that belong to someone else', async () => {
    const a = await signedUpAgent(ctx, 'drop-k@example.com')
    const b = await signedUpAgent(ctx, 'drop-k2@example.com')
    const meta = await upload(a.agent, 100)
    const body = { type: 'file', s3Key: meta.body.s3Key, fileName: 'f', fileSize: 100, mimeType: 'text/plain' }
    expect((await a.agent.post('/api/drop').send(body)).body.error).toMatch(/didn’t arrive/)
    fake.objects.set(meta.body.s3Key, { size: 100, lastModified: new Date() })
    expect((await a.agent.post('/api/drop').send(body)).status).toBe(201)
    expect((await a.agent.post('/api/drop').send(body)).status).toBe(409)
    expect((await b.agent.post('/api/drop').send(body)).status).toBe(400) // a's prefix
  })

  it('limits the number of items, texts included; expired items stop counting', async () => {
    process.env.DROP_MAX_ITEMS = '3'
    const a = await signedUpAgent(ctx, 'drop-n@example.com')
    for (const t of ['one', 'two']) expect((await a.agent.post('/api/drop').send({ type: 'text', textContent: t })).status).toBe(201)
    expect((await drop(a.agent, 10)).status).toBe(201)
    const over = await a.agent.post('/api/drop').send({ type: 'text', textContent: 'four' })
    expect(over.status).toBe(413)
    expect(over.body.error).toMatch(/3 Drop items/)
    await DropItem.updateOne({ userId: a.userId, textContent: 'one' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await a.agent.post('/api/drop').send({ type: 'text', textContent: 'four' })).status).toBe(201)
  })

  it('pro accounts get bigger limits until the plan lapses', async () => {
    process.env.DROP_MAX_FILE_MB = '1'
    const a = await signedUpAgent(ctx, 'drop-pro@example.com')
    expect((await upload(a.agent, 5 * MB)).status).toBe(413)
    await User.updateOne({ _id: a.userId }, { $set: { plan: 'pro', planExpiresAt: new Date(Date.now() + 10 * HOUR) } })
    expect((await upload(a.agent, 5 * MB)).status).toBe(200)
    expect((await a.agent.get('/api/drop/status')).body.usage).toMatchObject({ plan: 'pro', maxFileBytes: 200 * MB })
    await User.updateOne({ _id: a.userId }, { $set: { planExpiresAt: new Date(Date.now() - 1000) } })
    expect((await upload(a.agent, 5 * MB)).status).toBe(413)
  })

  it('without storage set up, uploads say so', async () => {
    setStorage(null)
    const a = await signedUpAgent(ctx, 'drop-none@example.com')
    expect((await upload(a.agent, 10)).status).toBe(503)
    expect((await request(ctx.app).post('/api/drop/upload-url').send({})).status).toBe(401)
  })

  describe('cleanup of stored files nothing points at', () => {
    it('removes old orphans and expired files, keeps live files and recent uploads, across pages', async () => {
      const a = await signedUpAgent(ctx, 'drop-sweep@example.com')
      const old = new Date(Date.now() - 48 * HOUR)
      const live = await drop(a.agent, 10)
      fake.objects.get(live.body.s3Key)!.lastModified = old
      const expired = await drop(a.agent, 10)
      fake.objects.get(expired.body.s3Key)!.lastModified = old
      await DropItem.updateOne({ _id: expired.body._id, userId: a.userId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      fake.objects.set(`drop/${a.userId}/never-registered-old`, { size: 5, lastModified: old })
      fake.objects.set(`drop/${a.userId}/never-registered-old-2`, { size: 5, lastModified: old })
      fake.objects.set(`drop/${a.userId}/in-flight-upload`, { size: 5, lastModified: new Date() })
      fake.objects.set('other/prefix/file', { size: 5, lastModified: old })

      const result = await sweepDrop()
      expect(result.removed).toBe(3)
      expect([...fake.objects.keys()].sort()).toEqual([live.body.s3Key, `drop/${a.userId}/in-flight-upload`, 'other/prefix/file'].sort())
      expect((await sweepDrop()).removed).toBe(0)
    })

    it('is run by the cron endpoint, not more than every six hours, and does nothing without storage', async () => {
      process.env.CRON_SECRET = 'cron-secret'
      fake.objects.set('drop/aaaaaaaaaaaaaaaaaaaaaaaa/old-orphan', { size: 1, lastModified: new Date(Date.now() - 72 * HOUR) })
      expect((await request(ctx.app).get('/api/cron/tick?key=cron-secret')).status).toBe(200)
      await new Promise(r => setTimeout(r, 300))
      expect(fake.objects.size).toBe(0)
      fake.objects.set('drop/aaaaaaaaaaaaaaaaaaaaaaaa/old-orphan', { size: 1, lastModified: new Date(Date.now() - 72 * HOUR) })
      await request(ctx.app).get('/api/cron/tick?key=cron-secret')
      await new Promise(r => setTimeout(r, 300))
      expect(fake.objects.size).toBe(1) // throttled
      delete process.env.CRON_SECRET
    })
  })

  describe('thread limits', () => {
    it('free accounts have a thread cap; archiving makes room', async () => {
      process.env.MAX_THREADS_FREE = '2'
      const a = await signedUpAgent(ctx, 'cap-a@example.com')
      const mk = (name: string) => a.agent.post('/api/threads').send({ name, category: 'Other', frequency: 'daily' })
      expect((await mk('one')).status).toBe(201)
      const two = await mk('two')
      expect(two.status).toBe(201)
      const three = await mk('three')
      expect(three.status).toBe(400)
      expect(three.body.error).toMatch(/allows 2 threads/)
      await a.agent.delete(`/api/threads/${two.body._id}`)
      expect((await mk('three')).status).toBe(201)
    })

    it('imports create only the threads that fit and leave the rest unthreaded', async () => {
      process.env.MAX_THREADS_FREE = '1'
      const a = await signedUpAgent(ctx, 'cap-b@example.com')
      const res = await a.agent.post('/api/import/tasks').send({ rows: [{ title: 't1', thread: 'A' }, { title: 't2', thread: 'B' }], createThreads: true })
      expect(res.body).toMatchObject({ created: 2, threadsCreated: 1 })
      expect(await Thread.countDocuments({ userId: a.userId })).toBe(1)
      expect((await Task.findOne({ userId: a.userId, title: 't2' }))!.threadId).toBeNull()
      const file = { threads: [{ name: 'X' }, { name: 'Y' }], tasks: [] }
      const refused = await a.agent.post('/api/import/winterarc').send(file)
      expect(refused.status).toBe(400)
      expect(refused.body.error).toMatch(/allows 1 threads/)
      expect(await Thread.countDocuments({ userId: a.userId })).toBe(1)
    })

    it('a starter pack that does not fit is refused without using up the setup', async () => {
      process.env.MAX_THREADS_FREE = '2'
      const a = await signedUpAgent(ctx, 'cap-c@example.com')
      const refused = await a.agent.post('/api/onboarding').send({ templateId: 'developer' })
      expect(refused.status).toBe(400)
      expect((await a.agent.get('/api/auth/me')).body.user.onboarded).toBe(false)
      expect((await a.agent.post('/api/onboarding').send({ templateId: 'developer', threads: ['build', 'review'] })).status).toBe(201)
    })
  })
})
