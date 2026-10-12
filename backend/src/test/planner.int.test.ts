import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
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

  it('generation for one user never creates tasks for another', async () => {
    await clean()
    await thread({ frequency: 'daily' })
    await generateToday(userId, MONDAY)
    expect(await Task.countDocuments({ userId })).toBeGreaterThan(0)
    expect(await Task.countDocuments({ userId: otherId })).toBe(0)
  })
})
