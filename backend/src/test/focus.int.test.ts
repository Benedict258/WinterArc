import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Task } from '../models/Task'
import { generateToday } from '../services/dailyGenerationService'
import { summarize } from '../services/focusService'

const available = await dbReachable()
const monday = '2026-10-12'
const routine = (over: Record<string, unknown> = {}) => ({
  name: 'Morning', weekdays: [1], autoAdd: false,
  items: [
    { id: 'a1', title: 'Stretch', startTime: '07:00', minutes: 15, intensity: 'light' },
    { id: 'b2', title: 'Read a chapter', startTime: null, minutes: null, intensity: 'medium' },
  ],
  ...over,
})

describe('summarize (pure)', () => {
  const at = (iso: string, minutes = 25) => ({ startedAt: new Date(iso), minutes })
  const now = new Date('2026-10-12T12:00:00Z')
  it('totals today, lists 7 days and counts the streak', () => {
    const s = summarize([at('2026-10-12T08:00:00Z'), at('2026-10-12T09:00:00Z'), at('2026-10-11T09:00:00Z'), at('2026-10-10T09:00:00Z'), at('2026-10-07T09:00:00Z')], 'UTC', now)
    expect(s.todayMinutes).toBe(50)
    expect(s.todayRounds).toBe(2)
    expect(s.streak).toBe(3)
    expect(s.week).toHaveLength(7)
    expect(s.week[6].day).toBe('2026-10-12')
    expect(s.weekMinutes).toBe(125)
  })
  it('a day without a round yet keeps yesterday’s streak alive', () => {
    expect(summarize([at('2026-10-11T09:00:00Z'), at('2026-10-10T09:00:00Z')], 'UTC', now).streak).toBe(2)
    expect(summarize([at('2026-10-09T09:00:00Z')], 'UTC', now).streak).toBe(0)
  })
  it('uses the person’s timezone for the day boundary', () => {
    const late = [at('2026-10-12T23:30:00Z')] // already the 13th in Lagos? no: UTC+1 → 00:30 on the 13th
    expect(summarize(late, 'Africa/Lagos', new Date('2026-10-13T08:00:00Z')).todayMinutes).toBe(25)
    expect(summarize(late, 'UTC', new Date('2026-10-13T08:00:00Z')).todayMinutes).toBe(0)
  })
})

describe.skipIf(!available)('focus sessions and routines', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { await ctx.stop() })

  it('requires sign-in and records a session once even if retried', async () => {
    const { agent } = await signedUpAgent(ctx, 'focus1@example.com')
    const body = { startedAt: new Date(Date.now() - 60_000).toISOString(), minutes: 25, label: 'Essay', clientId: 'dev-1-abc' }
    const a = await agent.post('/api/focus/sessions').send(body)
    const b = await agent.post('/api/focus/sessions').send(body)
    expect(a.status).toBe(200)
    expect(b.body.duplicate).toBe(true)
    expect(b.body.id).toBe(a.body.id)
    const sum = (await agent.get('/api/focus/summary')).body
    expect(sum.todayRounds).toBe(1)
    expect(sum.recent).toHaveLength(1)
    expect((await agent.post('/api/focus/sessions').send({ ...body, minutes: 0, clientId: 'x' })).status).toBe(400)
    expect((await agent.post('/api/focus/sessions').send({ ...body, startedAt: 'nope', clientId: 'y' })).status).toBe(400)
    expect((await agent.post('/api/focus/sessions').send({ ...body, taskId: '0123456789abcdef01234567', clientId: 'z' })).status).toBe(404)
  })

  it('counts a round once even when the same upload arrives several times at once', async () => {
    const { agent } = await signedUpAgent(ctx, 'focus1b@example.com')
    const body = { startedAt: new Date(Date.now() - 60_000).toISOString(), minutes: 25, clientId: 'dev-race-1' }
    await Promise.all(Array.from({ length: 6 }, () => agent.post('/api/focus/sessions').send(body)))
    expect((await agent.get('/api/focus/summary')).body.todayRounds).toBe(1)
  })

  it('keeps one person’s sessions and routines away from another', async () => {
    const a = await signedUpAgent(ctx, 'focus2@example.com')
    const b = await signedUpAgent(ctx, 'focus3@example.com')
    const made = (await a.agent.post('/api/routines').send(routine())).body
    const s = (await a.agent.post('/api/focus/sessions').send({ startedAt: new Date().toISOString(), minutes: 25, clientId: 'iso-1' })).body
    expect((await b.agent.get('/api/routines')).body).toEqual([])
    expect((await b.agent.put(`/api/routines/${made.id}`).send(routine({ name: 'Hijack' }))).status).toBe(404)
    expect((await b.agent.delete(`/api/routines/${made.id}`)).status).toBe(404)
    expect((await b.agent.post(`/api/routines/${made.id}/apply`).send({ date: monday })).status).toBe(404)
    expect((await b.agent.delete(`/api/focus/sessions/${s.id}`)).status).toBe(404)
    expect((await b.agent.get('/api/focus/summary')).body.todayRounds).toBe(0)
    expect((await a.agent.get('/api/routines')).body[0].name).toBe('Morning')
  })

  it('validates routines and caps how many you can keep', async () => {
    const { agent } = await signedUpAgent(ctx, 'focus4@example.com')
    expect((await agent.post('/api/routines').send(routine({ name: '' }))).status).toBe(400)
    expect((await agent.post('/api/routines').send(routine({ items: [] }))).status).toBe(400)
    expect((await agent.post('/api/routines').send({ nonsense: true })).status).toBe(400)
    for (let i = 0; i < 20; i++) expect((await agent.post('/api/routines').send(routine({ name: `R${i}` }))).status).toBe(200)
    const over = await agent.post('/api/routines').send(routine({ name: 'one too many' }))
    expect(over.status).toBe(409)
  })

  it('adds a routine to a day once, with timed steps as fixed-time items', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'focus5@example.com')
    const r = (await agent.post('/api/routines').send(routine())).body
    expect((await agent.post(`/api/routines/${r.id}/apply`).send({ date: 'tomorrow' })).status).toBe(400)
    const first = await agent.post(`/api/routines/${r.id}/apply`).send({ date: monday })
    const again = await agent.post(`/api/routines/${r.id}/apply`).send({ date: monday })
    expect(first.body.added).toBe(2)
    expect(again.body.added).toBe(0)
    const tasks = await Task.find({ userId, date: new Date(`${monday}T00:00:00.000Z`) }).sort({ title: -1 })
    expect(tasks).toHaveLength(2)
    const stretch = tasks.find(t => t.title === 'Stretch')!
    expect(stretch).toMatchObject({ isEvent: true, startTime: '07:00', endTime: '07:15', source: 'routine' })
    const read = tasks.find(t => t.title === 'Read a chapter')!
    expect(read.isEvent).toBe(false)
    // a step that was already done stays done when the routine is added again
    await Task.updateOne({ _id: read._id, userId }, { status: 'done' })
    await agent.post(`/api/routines/${r.id}/apply`).send({ date: monday })
    expect((await Task.findOne({ _id: read._id, userId }))!.status).toBe('done')
  })

  it('adds automatic routines when the day is planned, only on their weekdays', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'focus6@example.com')
    await agent.post('/api/routines').send(routine({ name: 'Auto', weekdays: [1], autoAdd: true }))
    await generateToday(userId, monday)
    await generateToday(userId, monday) // re-planning (rebalance) must not duplicate
    expect(await Task.countDocuments({ userId, source: 'routine', date: new Date(`${monday}T00:00:00.000Z`) })).toBe(2)
    await generateToday(userId, '2026-10-13') // a Tuesday
    expect(await Task.countDocuments({ userId, source: 'routine', date: new Date('2026-10-13T00:00:00.000Z') })).toBe(0)
  })

  it('saves focus preferences with the rest of settings', async () => {
    const { agent } = await signedUpAgent(ctx, 'focus7@example.com')
    expect((await agent.put('/api/settings').send({ focus: { focusMin: 50, autoStart: true } })).status).toBe(200)
    expect((await agent.get('/api/settings')).body.focus).toMatchObject({ focusMin: 50, shortMin: 5, autoStart: true })
    expect((await agent.put('/api/settings').send({ focus: { focusMin: 0 } })).status).toBe(400)
  })
})
