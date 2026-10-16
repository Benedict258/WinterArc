import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { Workout } from '../models/Workout'
import { StepDay } from '../models/StepDay'
import { BodyMetric } from '../models/BodyMetric'
import { addDays } from '../../../src/shared/fitness'

const available = await dbReachable()
const today = () => new Date().toISOString().slice(0, 10)
const set = (reps: number | null, weightKg: number | null) => ({ reps, weightKg, seconds: null, km: null })
const lift = (over: Record<string, unknown> = {}) => ({
  day: today(), title: 'Push day', kind: 'strength', minutes: 50, km: null, calories: null, effort: 7, notes: '',
  exercises: [{ name: 'Bench press', sets: [set(8, 60), set(5, 80)] }], ...over,
})

describe.skipIf(!available)('fitness', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp() })
  afterAll(async () => { await ctx.stop() })

  it('logs, edits and deletes workouts and reports bests and the week', async () => {
    const { agent } = await signedUpAgent(ctx, 'fit1@example.com')
    const w = await agent.post('/api/fitness/workouts').send(lift())
    expect(w.status).toBe(200)
    const edited = await agent.put(`/api/fitness/workouts/${w.body.id}`).send(lift({ title: 'Push day (heavy)', exercises: [{ name: 'Bench press', sets: [set(3, 90)] }] }))
    expect(edited.body.title).toBe('Push day (heavy)')
    await agent.post('/api/fitness/workouts').send({ day: today(), title: 'Easy run', kind: 'cardio', minutes: 30, km: 5, calories: null, effort: 4, notes: '', exercises: [] })
    const o = (await agent.get('/api/fitness/overview')).body
    expect(o.workouts).toHaveLength(2)
    expect(o.week).toMatchObject({ count: 2, minutes: 80, km: 5, goal: 3 })
    expect(o.bests[0]).toMatchObject({ exercise: 'Bench press', weightKg: 90, reps: 3 })
    expect(o.weeks).toHaveLength(12)
    expect((await agent.delete(`/api/fitness/workouts/${w.body.id}`)).body.ok).toBe(true)
    expect((await agent.get('/api/fitness/workouts')).body).toHaveLength(1)
  })

  it('rejects bad workouts, days and metrics', async () => {
    const { agent } = await signedUpAgent(ctx, 'fit2@example.com')
    const post = (b: object) => agent.post('/api/fitness/workouts').send(b)
    expect((await post(lift({ title: '' }))).status).toBe(400)
    expect((await post(lift({ kind: 'yoga' }))).status).toBe(400)
    expect((await post(lift({ day: addDays(today(), 5) }))).status).toBe(400)
    expect((await post(lift({ day: addDays(today(), -2000) }))).status).toBe(400)
    expect((await post(lift({ exercises: [{ name: 'x', sets: [set(null, null)] }] }))).status).toBe(400)
    expect((await post({ nonsense: 1 })).status).toBe(400)
    expect((await agent.put(`/api/fitness/steps/${today()}`).send({ steps: -5 })).status).toBe(400)
    expect((await agent.put(`/api/fitness/steps/${today()}`).send({ steps: 999999 })).status).toBe(400)
    expect((await agent.put(`/api/fitness/steps/notaday`).send({ steps: 10 })).status).toBe(400)
    expect((await agent.put(`/api/fitness/metrics/${today()}`).send({ weightKg: 5 })).status).toBe(400)
    expect((await agent.put(`/api/fitness/metrics/${today()}`).send({})).status).toBe(400)
    expect((await agent.put(`/api/fitness/metrics/${today()}`).send({ bogus: 1 })).status).toBe(400)
  })

  it('manual steps count until the device reports; the device value wins and typed values are kept', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'fit3@example.com')
    await agent.put(`/api/fitness/steps/${today()}`).send({ steps: 4000 })
    expect((await agent.get('/api/fitness/overview')).body.todaySteps).toBe(4000)
    const sync = await agent.post('/api/fitness/sync').send({ steps: [{ day: today(), steps: 7312 }, { day: addDays(today(), -1), steps: 9000 }, { day: addDays(today(), -2), steps: -1 }] })
    expect(sync.body.steps).toBe(2) // the invalid one is skipped, not fatal
    let o = (await agent.get('/api/fitness/overview')).body
    expect(o.todaySteps).toBe(7312)
    expect(o.steps.find((s: any) => s.day === addDays(today(), -1))).toMatchObject({ steps: 9000, source: 'device' })
    // a later manual edit does not hide the device count; clearing manual keeps the device value
    await agent.put(`/api/fitness/steps/${today()}`).send({ steps: 0 })
    expect((await agent.get('/api/fitness/overview')).body.todaySteps).toBe(7312)
    expect(await StepDay.countDocuments({ userId })).toBe(2)
    // syncing again replaces the device value (idempotent), no duplicates
    await agent.post('/api/fitness/sync').send({ steps: [{ day: today(), steps: 8000 }] })
    o = (await agent.get('/api/fitness/overview')).body
    expect(o.todaySteps).toBe(8000)
    expect(await StepDay.countDocuments({ userId })).toBe(2)
    expect(o.stepStats.goalDays7).toBe(2) // 8000 and 9000 meet the 8000 goal
  })

  it('syncs body metrics without overwriting what was typed', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'fit4@example.com')
    await agent.put(`/api/fitness/metrics/${today()}`).send({ weightKg: 72.4, mood: 4 })
    await agent.post('/api/fitness/sync').send({ metrics: [{ day: today(), weightKg: 99, restingHr: 58 }] })
    let m = (await BodyMetric.findOne({ userId, day: today() }))!
    expect(m.weightKg).toBe(72.4)   // typed value kept
    expect(m.restingHr).toBe(58)    // empty field filled by the device
    expect(m.syncedFields).toEqual(['restingHr'])
    await agent.post('/api/fitness/sync').send({ metrics: [{ day: today(), restingHr: 55 }] })
    m = (await BodyMetric.findOne({ userId, day: today() }))!
    expect(m.restingHr).toBe(55)    // device values refresh
    // typing over a device value takes ownership of it
    await agent.put(`/api/fitness/metrics/${today()}`).send({ restingHr: 60 })
    await agent.post('/api/fitness/sync').send({ metrics: [{ day: today(), restingHr: 50 }] })
    expect((await BodyMetric.findOne({ userId, day: today() }))!.restingHr).toBe(60)
    // implausible device values are ignored
    await agent.post('/api/fitness/sync').send({ metrics: [{ day: addDays(today(), -1), weightKg: 2 }] })
    expect(await BodyMetric.countDocuments({ userId, day: addDays(today(), -1) })).toBe(0)
  })

  it('weight trend and change over time', async () => {
    const { agent } = await signedUpAgent(ctx, 'fit5@example.com')
    for (const [back, kg] of [[10, 80], [5, 79], [0, 78]] as const) await agent.put(`/api/fitness/metrics/${addDays(today(), -back)}`).send({ weightKg: kg })
    const o = (await agent.get('/api/fitness/overview')).body
    expect(o.weightChange30).toBe(-2)
    expect(o.weightTrend).toHaveLength(3)
    expect((await agent.delete(`/api/fitness/metrics/${today()}`)).body.ok).toBe(true)
    expect((await agent.get('/api/fitness/overview')).body.metrics).toHaveLength(2)
  })

  it('keeps everything private to its owner', async () => {
    const a = await signedUpAgent(ctx, 'fit6@example.com')
    const b = await signedUpAgent(ctx, 'fit7@example.com')
    const w = (await a.agent.post('/api/fitness/workouts').send(lift())).body
    await a.agent.put(`/api/fitness/steps/${today()}`).send({ steps: 5000 })
    await a.agent.put(`/api/fitness/metrics/${today()}`).send({ weightKg: 70 })
    const o = (await b.agent.get('/api/fitness/overview')).body
    expect(o.workouts).toEqual([])
    expect(o.todaySteps).toBe(0)
    expect(o.metrics).toEqual([])
    expect((await b.agent.put(`/api/fitness/workouts/${w.id}`).send(lift({ title: 'mine now' }))).status).toBe(404)
    expect((await b.agent.delete(`/api/fitness/workouts/${w.id}`)).status).toBe(404)
    expect(await Workout.countDocuments({ userId: a.userId })).toBe(1)
  })

  it('stores fitness preferences with settings and uses them', async () => {
    const { agent } = await signedUpAgent(ctx, 'fit8@example.com')
    expect((await agent.put('/api/settings').send({ fitness: { stepGoal: 5000, units: 'imperial' } })).status).toBe(200)
    await agent.put(`/api/fitness/steps/${today()}`).send({ steps: 5200 })
    const o = (await agent.get('/api/fitness/overview')).body
    expect(o.prefs).toMatchObject({ stepGoal: 5000, units: 'imperial', weeklyWorkouts: 3 })
    expect(o.stepStats.goalDays7).toBe(1)
    expect((await agent.put('/api/settings').send({ fitness: { stepGoal: 10 } })).status).toBe(400)
  })
})
