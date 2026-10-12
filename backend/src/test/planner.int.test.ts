import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { Settings } from '../models/Settings'
import { generateToday, rolloverMissed } from '../services/dailyGenerationService'

const available = await dbReachable()
const MONDAY = '2026-10-05'
const TUESDAY = '2026-10-06'
const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

describe.skipIf(!available)('planner rules against the database', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let userId: string
  let otherId: string

  beforeAll(async () => {
    ctx = await startTestApp()
    userId = (await signedUpAgent(ctx, 'planner@example.com')).userId
    otherId = (await signedUpAgent(ctx, 'other@example.com')).userId
  })
  afterAll(async () => { await ctx.stop() })

  const clean = async () => {
    for (const id of [userId, otherId]) {
      await Task.deleteMany({ userId: id })
      await Thread.deleteMany({ userId: id })
    }
  }
  const thread = (over: object = {}) => Thread.create({ userId, name: 'T', category: 'Other', frequency: 'weekly', taskMode: 'continuous', ...over })
  const asPlan = async () => (await Thread.find({ userId })).map(t => ({
    id: String(t._id), name: t.name, frequency: t.frequency as any, fixedDay: t.fixedDay ?? null,
    taskMode: t.taskMode as any, priority: 'medium' as const, intensity: 'medium' as const,
  }))

  it('rollover: planner work goes back to the queue, placeholders and events are skipped, your own tasks stay', async () => {
    await clean()
    const t = await thread()
    const base = { userId, status: 'pending', date: day(MONDAY), timeBlock: 'morning' }
    const queued = await Task.create({ ...base, title: 'planner placed', threadId: t._id, scheduledBy: 'generator' })
    const placeholder = await Task.create({ ...base, title: 'T', threadId: t._id, source: 'auto-generated', scheduledBy: 'generator' })
    const event = await Task.create({ ...base, title: 'Class', isEvent: true, startTime: '10:00', endTime: '11:00' })
    const manual = await Task.create({ ...base, title: 'mine', scheduledBy: null })
    const done = await Task.create({ ...base, title: 'done', status: 'done', scheduledBy: 'generator' })
    const theirs = await Task.create({ ...base, userId: otherId, title: 'someone else', scheduledBy: 'generator' })

    await rolloverMissed(userId, TUESDAY, await asPlan())

    const get = (id: unknown, u = userId) => Task.findOne({ _id: id, userId: u })
    expect(await get(queued._id)).toMatchObject({ date: null, timeBlock: 'unscheduled', scheduledBy: null })
    expect((await get(queued._id))!.missedOn).toEqual(day(MONDAY))
    expect(await get(placeholder._id)).toMatchObject({ status: 'skipped' })
    expect(await get(event._id)).toMatchObject({ status: 'skipped' })
    expect(await get(manual._id)).toMatchObject({ status: 'pending' })
    expect((await get(manual._id))!.date).toEqual(day(MONDAY))
    expect(await get(done._id)).toMatchObject({ status: 'done' })
    expect((await get(theirs._id, otherId))).toMatchObject({ status: 'pending' }) // never touched
  })

  it('makeup: a missed fixed-day thread is owed one makeup the next day, only once', async () => {
    await clean()
    const t = await thread({ frequency: 'fixed-day', fixedDay: 0 }) // Mondays
    await Task.create({ userId, status: 'pending', date: day(MONDAY), title: 'T', threadId: t._id, source: 'auto-generated', scheduledBy: 'generator' })
    const threads = await asPlan()

    expect([...(await rolloverMissed(userId, TUESDAY, threads))]).toEqual([String(t._id)])
    // Running it again (e.g. Rebalance) still reports it; the day after, it no longer does
    expect([...(await rolloverMissed(userId, TUESDAY, threads))]).toEqual([String(t._id)])
    expect((await rolloverMissed(userId, '2026-10-07', threads)).size).toBe(0)
  })

  it('generateToday: places the makeup on Tuesday, then nothing more that week', async () => {
    await clean()
    const t = await thread({ frequency: 'fixed-day', fixedDay: 0 })
    await Task.create({ userId, status: 'pending', date: day(MONDAY), title: 'T', threadId: t._id, source: 'auto-generated', scheduledBy: 'generator' })

    await generateToday(userId, TUESDAY)
    const tuesday = await Task.find({ userId, date: day(TUESDAY), threadId: t._id })
    expect(tuesday).toHaveLength(1)
    await generateToday(userId, '2026-10-07') // Wednesday
    expect(await Task.countDocuments({ userId, date: day('2026-10-07') })).toBe(0)
  })

  it('weekly count includes tasks you added by hand, so no duplicate placeholder appears', async () => {
    await clean()
    const t = await thread({ frequency: 'weekly' })
    await Task.create({ userId, title: 'hand-made', threadId: t._id, date: day(TUESDAY), timeBlock: 'morning', status: 'done', scheduledBy: null })
    // Sunday is the last day a weekly thread could still be placed; with the hand-made task it is already satisfied
    for (const d of ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) await generateToday(userId, d)
    expect(await Task.countDocuments({ userId, source: 'auto-generated' })).toBe(0)
  })

  it('backlog filler: pulls in no-thread, no-due-date tasks (at most two) and leaves thread tasks alone', async () => {
    await clean()
    // Thursday-only thread, so it never competes for Monday's room (a weekly thread's day depends on its random id)
    const t = await thread({ taskMode: 'discrete', frequency: 'fixed-day', fixedDay: 3 })
    for (const title of ['b1', 'b2', 'b3']) await Task.create({ userId, title, status: 'pending', date: null })
    await Task.create({ userId, title: 'thread task', threadId: t._id, status: 'pending', date: null })

    await generateToday(userId, MONDAY)
    const scheduled = await Task.find({ userId, date: day(MONDAY) })
    const backlogToday = scheduled.filter(x => !x.threadId)
    expect(backlogToday).toHaveLength(2)
    // one backlog task is still waiting (which one depends on creation order, so don't assume)
    expect(await Task.countDocuments({ userId, threadId: null, date: null })).toBe(1)
  })

  it('rules can be switched off per user: no rollover, no makeup', async () => {
    await clean()
    const t = await thread({ frequency: 'fixed-day', fixedDay: 0 })
    const placed = await Task.create({ userId, status: 'pending', date: day(MONDAY), title: 'x', threadId: t._id, scheduledBy: 'generator' })
    const threads = await asPlan()
    expect((await rolloverMissed(userId, TUESDAY, threads, { rollover: false })).size).toBe(0)
    expect((await Task.findOne({ _id: placed._id, userId }))!.date).toEqual(day(MONDAY)) // left alone
    await rolloverMissed(userId, TUESDAY, threads, { makeup: false })
    expect((await rolloverMissed(userId, TUESDAY, threads, { makeup: false })).size).toBe(0)
  })

  it('settings API: planner rules save, merge with earlier values and reject nonsense', async () => {
    const { agent } = await signedUpAgent(ctx, 'rules@example.com')
    expect((await agent.get('/api/settings')).body.planner).toMatchObject({ rollover: true, backlogPerDay: 2 })
    const saved = await agent.put('/api/settings').send({ planner: { backlogPerDay: 0 } })
    expect(saved.status).toBe(200)
    await agent.put('/api/settings').send({ planner: { rollover: false } })
    expect((await agent.get('/api/settings')).body.planner).toMatchObject({ backlogPerDay: 0, rollover: false, makeup: true })
    expect((await agent.put('/api/settings').send({ planner: { backlogPerDay: 99 } })).status).toBe(400)
    const w = { light: 0, medium: 0, heavy: 0 }
    const bad = [{ id: 'a', label: 'A', start: 18, weights: w }, { id: 'b', label: 'B', start: 10, weights: w }]
    expect((await agent.put('/api/settings').send({ planner: { blocks: bad } })).status).toBe(400)
    const good = [{ id: 'early', label: 'Early', start: 5, weights: w }, { id: 'late', label: 'Late', start: 14, weights: w }]
    expect((await agent.put('/api/settings').send({ planner: { blocks: good } })).status).toBe(200)
    expect((await agent.get('/api/settings')).body.planner.blocks.map((b: any) => b.id)).toEqual(['early', 'late'])
  })

  it('tasks follow the user\'s blocks: stale block ids are re-homed and planner uses the new ones', async () => {
    const { agent, userId: uid2 } = await signedUpAgent(ctx, 'blocks@example.com')
    const w = { light: 0, medium: 0, heavy: 0 }
    await agent.put('/api/settings').send({ planner: { blocks: [{ id: 'am', label: 'AM', start: 6, weights: w }, { id: 'pm', label: 'PM', start: 13, weights: w }] } })
    const made = await agent.post('/api/tasks').send({ title: 'old client', date: '2026-10-05', timeBlock: 'evening' })
    expect(made.status).toBe(201)
    expect(made.body.timeBlock).toBe('pm') // evening (19:00) -> PM
    expect((await agent.post('/api/tasks').send({ title: 'bad', timeBlock: 'Not A Block!' })).status).toBe(400)
    await Thread.create({ userId: uid2, name: 'D', category: 'Other', frequency: 'daily', taskMode: 'continuous' })
    await generateToday(uid2, MONDAY)
    const placed = await Task.find({ userId: uid2, source: 'auto-generated' })
    expect(placed.length).toBeGreaterThan(0)
    for (const t of placed) expect(['am', 'pm']).toContain(t.timeBlock)
  })

  it('a user\'s planner rules apply only to that user', async () => {
    await clean()
    await Settings.updateOne({ userId }, { $set: { 'planner.backlogPerDay': 0 } }, { upsert: true })
    for (const id of [userId, otherId]) await Task.create({ userId: id, title: 'b', status: 'pending', date: null })
    await generateToday(userId, MONDAY)
    await generateToday(otherId, MONDAY)
    expect(await Task.countDocuments({ userId, date: day(MONDAY) })).toBe(0)
    expect(await Task.countDocuments({ userId: otherId, date: day(MONDAY) })).toBe(1)
  })

  it('onboarding: applies a template once, saves the structure, keeps users apart', async () => {
    const a = await signedUpAgent(ctx, 'onboard-a@example.com')
    const b = await signedUpAgent(ctx, 'onboard-b@example.com')
    expect((await a.agent.get('/api/auth/me')).body.user.onboarded).toBe(false)
    const list = await a.agent.get('/api/templates')
    expect(list.body.templates.map((t: any) => t.id)).toContain('developer')

    expect((await a.agent.post('/api/onboarding').send({ templateId: 'nope' })).status).toBe(400)
    expect((await a.agent.post('/api/onboarding').send({ templateId: 'student', threads: ['ghost'] })).status).toBe(400)
    expect((await a.agent.post('/api/onboarding').send({ templateId: 'student', preset: 'wild' })).status).toBe(400)
    expect((await a.agent.get('/api/auth/me')).body.user.onboarded).toBe(false) // failures don't use up the setup

    const done = await a.agent.post('/api/onboarding').send({ templateId: 'student', threads: ['study', 'assignments'], preset: 'strict', timezone: 'Africa/Lagos' })
    expect(done.status).toBe(201)
    const names = (await Thread.find({ userId: a.userId })).map(t => t.name).sort()
    expect(names).toEqual(['Assignments & deadlines', 'Study sessions'])
    const tasks = await Task.find({ userId: a.userId, source: 'manual' })
    expect(tasks.map(t => t.title)).toEqual(expect.arrayContaining(["List this term's courses and deadlines"]))
    expect(tasks.some(t => t.title === 'Draft a weekly study timetable')).toBe(true)
    const settings = (await a.agent.get('/api/settings')).body
    expect(settings.timezone).toBe('Africa/Lagos')
    expect(settings.planner.blocks.map((x: any) => x.id)).toEqual(['morning', 'midday', 'afternoon', 'evening'])
    expect(settings.planner.backlogPerDay).toBe(3)
    expect(settings.gridBalancing.maxDailyIntensity).toBe(8)
    expect((await a.agent.get('/api/auth/me')).body.user.onboarded).toBe(true)

    // second time: refused, nothing duplicated
    expect((await a.agent.post('/api/onboarding').send({ templateId: 'developer' })).status).toBe(409)
    expect(await Thread.countDocuments({ userId: a.userId })).toBe(2)

    // the other user is untouched, and can skip with Blank
    expect(await Thread.countDocuments({ userId: b.userId })).toBe(0)
    expect((await b.agent.post('/api/onboarding').send({ templateId: 'blank' })).status).toBe(201)
    expect(await Thread.countDocuments({ userId: b.userId })).toBe(0)
  })

  it('onboarding: optional threads are off by default and custom blocks are validated', async () => {
    const c = await signedUpAgent(ctx, 'onboard-c@example.com')
    const w = { light: 0, medium: 0, heavy: 0 }
    const bad = [{ id: 'x', label: 'X', start: 5, weights: w }]
    expect((await c.agent.post('/api/onboarding').send({ templateId: 'student', blocks: bad })).status).toBe(400)
    const mine = [{ id: 'am', label: 'AM', start: 5, weights: w }, { id: 'pm', label: 'PM', start: 15, weights: w }]
    expect((await c.agent.post('/api/onboarding').send({ templateId: 'student', blocks: mine })).status).toBe(201)
    const threads = await Thread.find({ userId: c.userId })
    expect(threads.length).toBe(5) // all but the optional Lectures event
    expect(threads.some(t => t.taskMode === 'event')).toBe(false)
    expect((await c.agent.get('/api/settings')).body.planner.blocks.map((x: any) => x.id)).toEqual(['am', 'pm'])
  })

  it('generation for one user never creates tasks for another', async () => {
    await clean()
    await thread({ frequency: 'daily' })
    await generateToday(userId, MONDAY)
    expect(await Task.countDocuments({ userId })).toBeGreaterThan(0)
    expect(await Task.countDocuments({ userId: otherId })).toBe(0)
  })
})
