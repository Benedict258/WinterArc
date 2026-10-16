import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { setModelCaller } from '../services/aiService'
import { Habit } from '../models/Habit'
import { HabitLog } from '../models/HabitLog'
import { AiProposal } from '../models/AiProposal'
import { createHabit } from '../services/habitService'

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
const today = () => new Date().toISOString().slice(0, 10)

describe.skipIf(!available)('assistant and habits', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  beforeAll(async () => { ctx = await startTestApp(); process.env.GROQ_API_KEY = 'gsk_test' })
  afterAll(async () => { delete process.env.GROQ_API_KEY; setModelCaller(null); await ctx.stop() })
  afterEach(() => setModelCaller(null))
  const say = (agent: any, content: string) => agent.post('/api/ai/chat').send({ messages: [{ role: 'user', content }] })

  it('logs a check-in straight away and reports what it recorded', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hai1@example.com')
    const read = await createHabit(userId, { name: 'Reading', emoji: '📚', unit: 'pages', weekdays: [0, 1, 2, 3, 4, 5, 6], target: 20 })
    const calls = script(turn(null, [tool('a', 'log_habit', { habit: 'reading', value: 25 })]), turn('Logged 25 pages. Nice.'))
    const res = await say(agent, 'read 25 pages today')
    expect(res.status).toBe(200)
    expect(res.body.logged).toHaveLength(1)
    expect(res.body.logged[0]).toMatchObject({ habit: 'Reading', value: 25, target: 20, done: true, streak: 1 })
    expect(await HabitLog.countDocuments({ userId, habitId: read.id, day: today() })).toBe(1)
    // the model saw the habit in its context and got the result back
    expect(calls[0].messages[0].content).toContain('Reading')
    expect(calls[1].messages.find((m: any) => m.role === 'tool').content).toMatch(/Logged\. Reading: 25\/20 pages/)
  })

  it('asks instead of guessing when a name is ambiguous or unknown, and logs nothing', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hai2@example.com')
    await createHabit(userId, { name: 'Gym', weekdays: [1], target: 1 }); await createHabit(userId, { name: 'Gym stretch', weekdays: [1], target: 1 })
    const calls = script(turn(null, [tool('a', 'log_habit', { habit: 'gy', value: 1 }), tool('b', 'log_habit', { habit: 'swimming', value: 1 })]), turn('Which one?'))
    const res = await say(agent, 'did gym')
    expect(res.body.logged).toEqual([])
    const results = calls[1].messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content)
    expect(results[0]).toMatch(/more than one habit matches/)
    expect(results[1]).toMatch(/no habit matches/)
    expect(await HabitLog.countDocuments({ userId })).toBe(0)
  })

  it('refuses bad arguments from the model without changing anything', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hai3@example.com')
    await createHabit(userId, { name: 'Walk', weekdays: [0, 1, 2, 3, 4, 5, 6], target: 1 })
    const calls = script(turn(null, [
      tool('a', 'log_habit', { habit: 'walk' }),                                  // neither value nor add
      tool('b', 'log_habit', { habit: 'walk', value: 1, add: 1 }),                // both
      tool('c', 'log_habit', { habit: 'walk', value: 1, day: '2999-01-01' }),     // future day
      tool('d', 'log_habit', { habit: 'walk', value: 'lots' }),                   // not a number
    ]), turn('Sorry.'))
    await say(agent, 'walked')
    const results = calls[1].messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content)
    expect(results.every((r: string) => r.startsWith('Error:'))).toBe(true)
    expect(await HabitLog.countDocuments({ userId })).toBe(0)
  })

  it('cannot log into another person’s habit even with their id', async () => {
    const a = await signedUpAgent(ctx, 'hai4@example.com')
    const b = await signedUpAgent(ctx, 'hai5@example.com')
    const theirs = await createHabit(b.userId, { name: 'Secret habit', weekdays: [0, 1, 2, 3, 4, 5, 6], target: 1 })
    await createHabit(a.userId, { name: 'Mine', weekdays: [0, 1, 2, 3, 4, 5, 6], target: 1 })
    const calls = script(turn(null, [tool('a', 'log_habit', { habit: theirs.id, value: 1 })]), turn('No.'))
    await say(a.agent, 'log it')
    expect(calls[1].messages.find((m: any) => m.role === 'tool').content).toMatch(/no habit matches/)
    expect(calls[0].messages[0].content).not.toContain('Secret habit')
    expect(await HabitLog.countDocuments({ userId: b.userId })).toBe(0)
  })

  it('proposes new habits for approval instead of creating them', async () => {
    const { agent, userId } = await signedUpAgent(ctx, 'hai6@example.com')
    script(turn(null, [tool('a', 'propose_create_habit', { name: 'Drink water', unit: 'glasses', target: 8, emoji: '💧' })]), turn('Here is a suggestion.'))
    const res = await say(agent, 'help me drink more water')
    expect(res.body.proposals).toHaveLength(1)
    expect(res.body.proposals[0].summary).toBe('Track habit “Drink water”')
    expect(await Habit.countDocuments({ userId })).toBe(0)
    const apply = await agent.post('/api/ai/proposals/apply').send({ ids: [res.body.proposals[0].id] })
    expect(apply.body.results[0]).toMatchObject({ ok: true })
    expect((await Habit.findOne({ userId }))!.target).toBe(8)
    expect(await AiProposal.countDocuments({ userId, status: 'applied' })).toBe(1)
  })

  it('rejects an invalid proposed habit with a message the model can act on', async () => {
    const { agent } = await signedUpAgent(ctx, 'hai7@example.com')
    const calls = script(turn(null, [tool('a', 'propose_create_habit', { name: 'X', weekdays: [9] })]), turn('Fixing.'))
    const res = await say(agent, 'new habit')
    expect(res.body.proposals).toEqual([])
    expect(calls[1].messages.find((m: any) => m.role === 'tool').content).toMatch(/^Error:/)
  })
})
