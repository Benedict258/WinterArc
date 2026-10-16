import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { setModelCaller } from '../services/aiService'
import { Workout } from '../models/Workout'
import { StepDay } from '../models/StepDay'
import { BodyMetric } from '../models/BodyMetric'

const available = await dbReachable()
const tool = (id: string, name: string, input: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(input) } })
const turn = (text: string | null, calls: any[] = []) => ({
  choices: [{ message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
  usage: { prompt_tokens: 500, completion_tokens: 100 },
})
function script(...responses: any[]) {
  const calls: Record<string, any>[] = []
  setModelCaller(async params => { calls.push(JSON.parse(JSON.stringify(params))); const n = responses.shift(); if (!n) throw new Error('script exhausted'); return n })
  return calls
}

describe.skipIf(!available)('assistant and fitness', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp(); process.env.GROQ_API_KEY = 'gsk_test' })
  afterAll(async () => { delete process.env.GROQ_API_KEY; setModelCaller(null); await ctx.stop() })
  afterEach(() => setModelCaller(null))
  const say = (agent: any, content: string) => agent.post('/api/ai/chat').send({ messages: [{ role: 'user', content }] })

  it('records a workout, steps and a measurement and shows what it recorded', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'fai1@example.com')
    script(turn(null, [
      tool('a', 'log_workout', { title: 'Leg day', kind: 'strength', minutes: 55, exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] }] }),
      tool('b', 'log_steps', { steps: 9100 }),
      tool('c', 'log_body_metric', { weightKg: 71.8, sleepHours: 7 }),
    ]), turn('Done.'))
    const res = await say(agent, 'leg day, squatted 2x5 at 100kg, 9100 steps, weigh 71.8, slept 7h')
    expect(res.body.logged).toHaveLength(3)
    expect(res.body.logged[0]).toMatchObject({ title: 'Leg day' })
    expect(await Workout.countDocuments({ userId })).toBe(1)
    expect((await Workout.findOne({ userId }))!.source).toBe('assistant')
    expect((await StepDay.findOne({ userId }))!.manual).toBe(9100)
    const m = (await BodyMetric.findOne({ userId }))!
    expect([m.weightKg, m.sleepHours]).toEqual([71.8, 7])
  })

  it('rejects out-of-range or empty input and records nothing', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'fai2@example.com')
    const calls = script(turn(null, [
      tool('a', 'log_workout', { title: '', kind: 'strength' }),
      tool('b', 'log_steps', { steps: 5_000_000 }),
      tool('c', 'log_body_metric', { weightKg: 3 }),
      tool('d', 'log_body_metric', {}),
      tool('e', 'log_workout', { title: 'Future', kind: 'cardio', minutes: 20, day: '2999-01-01' }),
    ]), turn('Sorry.'))
    await say(agent, 'log stuff')
    const results = calls[1].messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content)
    expect(results.every((r: string) => r.startsWith('Error:'))).toBe(true)
    expect(await Workout.countDocuments({ userId }) + await StepDay.countDocuments({ userId }) + await BodyMetric.countDocuments({ userId })).toBe(0)
  })

  it('summaries only contain the caller’s data', async () => {
    const a = await signedUpAgent(ctx, 'fai3@example.com')
    const b = await signedUpAgent(ctx, 'fai4@example.com')
    await b.agent.post('/api/fitness/workouts').send({ day: new Date().toISOString().slice(0, 10), title: 'SECRET SWIM', kind: 'cardio', minutes: 40, km: null, calories: null, effort: null, notes: '', exercises: [] })
    const calls = script(turn(null, [tool('a', 'fitness_summary', {})]), turn('Here you go.'))
    await say(a.agent, 'how am I doing?')
    const out = calls[1].messages.find((m: any) => m.role === 'tool').content
    expect(out).not.toContain('SECRET SWIM')
    expect(JSON.parse(out).todaySteps).toBe(0)
  })
})
