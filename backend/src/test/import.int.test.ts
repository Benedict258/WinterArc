import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'

const available = await dbReachable()

describe.skipIf(!available)('imports', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let me: Awaited<ReturnType<typeof signedUpAgent>>
  let other: Awaited<ReturnType<typeof signedUpAgent>>
  beforeAll(async () => {
    ctx = await startTestApp()
    me = await signedUpAgent(ctx, 'imp-me@example.com')
    other = await signedUpAgent(ctx, 'imp-other@example.com')
  })
  afterAll(async () => { await ctx.stop() })
  afterEach(() => { delete process.env.MAX_TASKS_PER_USER })

  const rows = [
    { title: 'Buy milk', dueDate: '2026-11-12', priority: 'high', thread: 'Errands' },
    { title: 'File taxes', thread: 'Errands', status: 'done' },
    { title: 'Loose task' },
  ]
  const post = (agent: any, body: unknown) => agent.post('/api/import/tasks').send(body)

  describe('rows from CSV, Todoist and Notion', () => {
    it('needs a signed-in user and sensible input', async () => {
      expect((await request(ctx.app).post('/api/import/tasks').send({ rows, createThreads: false })).status).toBe(401)
      expect((await post(me.agent, { rows: [], createThreads: false })).status).toBe(400)
      expect((await post(me.agent, { rows: Array(2001).fill({ title: 'x' }), createThreads: false })).status).toBe(400)
      expect((await post(me.agent, { rows })).status).toBe(400)
    })

    it('previews without writing, then imports with threads created on request', async () => {
      const preview = await post(me.agent, { rows, createThreads: true, dryRun: true })
      expect(preview.body).toMatchObject({ created: 3, duplicates: 0, newThreads: ['Errands'], threadsCreated: 0 })
      expect(await Task.countDocuments({ userId: me.userId })).toBe(0)

      const done = await post(me.agent, { rows, createThreads: true })
      expect(done.body).toMatchObject({ created: 3, duplicates: 0, invalid: 0, threadsCreated: 1 })
      const errands = await Thread.findOne({ userId: me.userId, name: 'Errands' })
      expect(errands).toBeTruthy()
      const milk = await Task.findOne({ userId: me.userId, title: 'Buy milk' })
      expect(String(milk!.threadId)).toBe(String(errands!._id))
      expect(milk!.dueDate!.toISOString()).toBe('2026-11-12T00:00:00.000Z')
      expect(milk).toMatchObject({ priority: 'high', status: 'pending', source: 'import', timeBlock: 'unscheduled' })
      expect(milk!.date).toBeNull()
      const taxes = await Task.findOne({ userId: me.userId, title: 'File taxes' })
      expect(taxes).toMatchObject({ status: 'done' })
      expect(taxes!.completedAt).toBeTruthy()
    })

    it('importing the same rows again adds nothing', async () => {
      const again = await post(me.agent, { rows, createThreads: true })
      expect(again.body).toMatchObject({ created: 0, duplicates: 3, threadsCreated: 0 })
      expect(await Task.countDocuments({ userId: me.userId })).toBe(3)
      expect(await Thread.countDocuments({ userId: me.userId, name: 'Errands' })).toBe(1)
    })

    it('without "create threads", unknown thread names leave tasks unthreaded', async () => {
      const res = await post(other.agent, { rows: [{ title: 'Alone', thread: 'Nope' }], createThreads: false })
      expect(res.body).toMatchObject({ created: 1, threadsCreated: 0 })
      expect((await Task.findOne({ userId: other.userId, title: 'Alone' }))!.threadId).toBeNull()
      expect(await Thread.countDocuments({ userId: other.userId })).toBe(0)
    })

    it('matches only the caller’s own threads and duplicates', async () => {
      // "Errands" and "Buy milk" exist for `me`, not for `other`
      const res = await post(other.agent, { rows: [{ title: 'Buy milk', dueDate: '2026-11-12', thread: 'Errands' }], createThreads: true })
      expect(res.body).toMatchObject({ created: 1, duplicates: 0, threadsCreated: 1 })
      const theirs = await Thread.findOne({ userId: other.userId, name: 'Errands' })
      const mine = await Thread.findOne({ userId: me.userId, name: 'Errands' })
      expect(String(theirs!._id)).not.toBe(String(mine!._id))
      expect(await Task.countDocuments({ userId: me.userId, title: 'Buy milk' })).toBe(1)
    })

    it('counts bad rows instead of failing the lot', async () => {
      const res = await post(me.agent, { rows: [{ title: '' }, { title: 'ok row' }, { title: 'bad date', dueDate: 'tomorrow' }, { title: 'x', priority: 'urgent' }, 'nope', null], createThreads: false })
      expect(res.body).toMatchObject({ created: 1, invalid: 5 })
    })

    it('stops at the per-person task limit, writing nothing', async () => {
      const mine = await signedUpAgent(ctx, 'imp-limit@example.com')
      process.env.MAX_TASKS_PER_USER = '5'
      const res = await post(mine.agent, { rows: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}` })), createThreads: false })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/over 5 tasks/)
      expect(await Task.countDocuments({ userId: mine.userId })).toBe(0)
    })

    it('treats titles as plain text', async () => {
      const mine = await signedUpAgent(ctx, 'imp-text@example.com')
      await post(mine.agent, { rows: [{ title: '<script>alert(1)</script> $where: 1' }], createThreads: false })
      expect((await Task.findOne({ userId: mine.userId }))!.title).toBe('<script>alert(1)</script> $where: 1')
    })
  })

  describe('a WinterArc export file', () => {
    const oldThread = '65aaaaaaaaaaaaaaaaaaaaaa'
    const file = {
      threads: [
        { _id: oldThread, name: 'Deep work', category: 'Active Build', frequency: 'daily', priority: 'high', intensity: 'heavy', taskMode: 'continuous', status: 'active' },
        { _id: '65bbbbbbbbbbbbbbbbbbbbbb', name: 'Class', frequency: 'weekly', taskMode: 'event', eventStart: '10:00', eventEnd: '11:00', eventDays: [0, 2, 9] },
      ],
      tasks: [
        { title: 'Ship it', threadId: oldThread, date: '2026-10-05T00:00:00.000Z', timeBlock: 'evening', status: 'done', completedAt: '2026-10-05T18:00:00.000Z', source: 'manual' },
        { title: 'Placeholder for Deep work', threadId: oldThread, date: '2026-10-06T00:00:00.000Z', source: 'auto-generated', status: 'pending' },
        { title: 'Finished placeholder', threadId: oldThread, date: '2026-10-04T00:00:00.000Z', source: 'auto-generated', status: 'done', completedAt: '2026-10-04T10:00:00.000Z' },
        { title: 'Team call', date: '2026-10-07T00:00:00.000Z', isEvent: true, startTime: '09:00', endTime: '09:30', source: 'google-calendar', calendarEventId: 'abc' },
        { title: 'Loose', dueDate: '2026-12-01T00:00:00.000Z' },
      ],
      goals: [{ period: 'Q4-2026', text: 'Run a 10k' }],
      wishlist: [{ item: 'Standing desk', note: 'adjustable', acquired: false }],
      settings: { timezone: 'Africa/Lagos' },
    }
    const send = (agent: any, body: unknown, q = '') => agent.post(`/api/import/winterarc${q}`).send(body)

    it('previews, then brings threads, tasks, goals and wishlist across with ids mapped', async () => {
      const mine = await signedUpAgent(ctx, 'imp-wa@example.com')
      const preview = await send(mine.agent, file, '?dryRun=1')
      expect(preview.body).toMatchObject({ created: 4, newThreads: ['Deep work', 'Class'], goalsCreated: 1, wishlistCreated: 1, threadsCreated: 0 })
      expect(await Thread.countDocuments({ userId: mine.userId })).toBe(0)

      const res = await send(mine.agent, file)
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ created: 4, threadsCreated: 2, goalsCreated: 1, wishlistCreated: 1 })
      const deep = await Thread.findOne({ userId: mine.userId, name: 'Deep work' })
      const cls = await Thread.findOne({ userId: mine.userId, name: 'Class' })
      expect(cls!.eventDays).toEqual([0, 2]) // the impossible weekday is dropped
      const shipped = await Task.findOne({ userId: mine.userId, title: 'Ship it' })
      expect(String(shipped!.threadId)).toBe(String(deep!._id))
      expect(shipped).toMatchObject({ status: 'done', timeBlock: 'evening', source: 'import' })
      expect(shipped!.completedAt!.toISOString()).toBe('2026-10-05T18:00:00.000Z')
      expect(await Task.exists({ userId: mine.userId, title: 'Placeholder for Deep work' })).toBeNull() // pending placeholders are noise
      expect(await Task.exists({ userId: mine.userId, title: 'Finished placeholder' })).toBeTruthy()
      const call = await Task.findOne({ userId: mine.userId, title: 'Team call' })
      expect(call).toMatchObject({ isEvent: true, startTime: '09:00', source: 'import' })
      expect(call!.calendarEventId).toBeUndefined()
      expect(await Goal.countDocuments({ userId: mine.userId })).toBe(1)
      expect((await WishlistItem.findOne({ userId: mine.userId }))!.item).toBe('Standing desk')

      // twice adds nothing
      const again = await send(mine.agent, file)
      expect(again.body).toMatchObject({ created: 0, duplicates: 4, threadsCreated: 0, goalsCreated: 0, wishlistCreated: 0 })
      expect(await Thread.countDocuments({ userId: mine.userId })).toBe(2)
      expect(await Task.countDocuments({ userId: mine.userId })).toBe(4)
    })

    it('puts tasks in the importer’s own day blocks and keeps people apart', async () => {
      const mine = await signedUpAgent(ctx, 'imp-blocks@example.com')
      const w = { light: 0, medium: 0, heavy: 0 }
      await mine.agent.put('/api/settings').send({ planner: { blocks: [{ id: 'am', label: 'AM', start: 6, weights: w }, { id: 'pm', label: 'PM', start: 15, weights: w }] } })
      await send(mine.agent, file)
      expect((await Task.findOne({ userId: mine.userId, title: 'Ship it' }))!.timeBlock).toBe('pm') // evening (19:00) → PM
      expect(await Thread.countDocuments({ userId: other.userId, name: 'Deep work' })).toBe(0)
    })

    it('takes a file bigger than the normal limit, and the normal route still refuses one', async () => {
      const mine = await signedUpAgent(ctx, 'imp-big@example.com')
      const filler = 'x'.repeat(1_500_000)
      expect((await send(mine.agent, { tasks: [{ title: 'one' }], padding: filler })).status).toBe(200)
      expect((await post(mine.agent, { rows: [{ title: 'one' }], createThreads: false, padding: filler })).status).toBe(413)
    })

    it('refuses nonsense', async () => {
      expect((await send(other.agent, { tasks: 'nope' })).status).toBe(400)
      expect((await request(ctx.app).post('/api/import/winterarc').send(file)).status).toBe(401)
    })
  })
})
