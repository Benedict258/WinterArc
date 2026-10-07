import { describe, it, expect } from 'vitest'
import {
  planDay,
  paceQuota,
  mondayIndex,
  weekStartKey,
  addDaysKey,
  toDayKey,
  type PlanThread,
  type PlanTask,
  type PlanState,
} from './dailyGenerationService'

const MONDAY = '2026-10-05'

function thread(id: string, overrides: Partial<PlanThread> = {}): PlanThread {
  return { id, name: `Thread ${id}`, frequency: 'weekly', taskMode: 'continuous', priority: 'medium', intensity: 'medium', ...overrides }
}

function task(id: string, threadId: string | null, overrides: Partial<PlanTask> = {}): PlanTask {
  return { id, threadId, title: `Task ${id}`, dueKey: null, priority: 'medium', intensity: 'medium', createdAt: 0, ...overrides }
}

function freshState(queue: PlanTask[] = []): PlanState {
  return { appearances: new Map(), queue, blockLoads: { morning: 0, afternoon: 0, evening: 0 } }
}

function simulateWeek(threads: PlanThread[], queue: PlanTask[] = []) {
  const state = freshState(queue)
  const days: ReturnType<typeof planDay>[] = []
  for (let i = 0; i < 7; i++) {
    state.blockLoads = { morning: 0, afternoon: 0, evening: 0 }
    days.push(planDay(addDaysKey(MONDAY, i), threads, state))
  }
  return { days, state }
}

describe('day keys', () => {
  it('uses Monday = 0', () => {
    expect(mondayIndex('2026-10-05')).toBe(0) // Monday
    expect(mondayIndex('2026-10-11')).toBe(6) // Sunday
    expect(weekStartKey('2026-10-11')).toBe('2026-10-05')
    expect(weekStartKey('2026-10-05')).toBe('2026-10-05')
  })

  it('computes today in the configured timezone, not UTC', () => {
    // 23:30 UTC on Oct 6 is already 00:30 Oct 7 in Lagos (UTC+1)
    const instant = new Date('2026-10-06T23:30:00Z')
    expect(toDayKey(instant, 'Africa/Lagos')).toBe('2026-10-07')
    expect(toDayKey(instant, 'UTC')).toBe('2026-10-06')
  })
})

describe('paceQuota', () => {
  it('always reaches the target by Sunday', () => {
    for (const target of [1, 3, 7]) {
      for (const phase of [0, 0.3, 0.99]) {
        expect(paceQuota(target, 6, phase)).toBe(target)
      }
    }
  })
})

describe('planDay', () => {
  it('places fixed-day threads only on their Monday-based day', () => {
    const wed = thread('wed', { frequency: 'fixed-day', fixedDay: 2 })
    const { days } = simulateWeek([wed])
    const placed = days.map(d => d.length)
    expect(placed).toEqual([0, 0, 1, 0, 0, 0, 0])
  })

  it('places a Monday fixed-day thread (fixedDay 0)', () => {
    const mon = thread('mon', { frequency: 'fixed-day', fixedDay: 0 })
    const actions = planDay(MONDAY, [mon], freshState())
    expect(actions).toHaveLength(1)
  })

  it('daily threads appear every day', () => {
    const { days } = simulateWeek([thread('d', { frequency: 'daily' })])
    expect(days.every(d => d.length === 1)).toBe(true)
  })

  it('spreads multiple-per-week threads instead of front-loading Monday', () => {
    const { days } = simulateWeek([thread('m', { frequency: 'multiple' })])
    const placedOn = days.map((d, i) => (d.length ? i : -1)).filter(i => i >= 0)
    expect(placedOn).toHaveLength(3)
    for (let i = 1; i < placedOn.length; i++) {
      expect(placedOn[i] - placedOn[i - 1]).toBeGreaterThan(1)
    }
  })

  it('spreads weekly threads across the week', () => {
    const threads = Array.from({ length: 14 }, (_, i) => thread(`w${i}abcdef`))
    const { days } = simulateWeek(threads)
    expect(days.flat()).toHaveLength(14)
    expect(days[0].length).toBeLessThan(14)
    expect(days.filter(d => d.length > 0).length).toBeGreaterThan(2)
  })

  it('discrete threads with an empty queue are skipped', () => {
    const { days } = simulateWeek([thread('x', { taskMode: 'discrete', frequency: 'daily' })])
    expect(days.flat()).toHaveLength(0)
  })

  it('discrete threads consume their queued tasks, highest priority first', () => {
    const t = thread('x', { taskMode: 'discrete', frequency: 'daily' })
    const queue = [
      task('low', 'x', { priority: 'low', createdAt: 1 }),
      task('high', 'x', { priority: 'high', createdAt: 2 }),
    ]
    const state = freshState(queue)
    const actions = planDay(MONDAY, [t], state)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ kind: 'queued', taskId: 'high' })
    expect(state.queue.map(q => q.id)).toEqual(['low'])
  })

  it('queued tasks with a far-off due date are still used by the normal pass', () => {
    const t = thread('x', { taskMode: 'discrete', frequency: 'daily' })
    const state = freshState([task('later', 'x', { dueKey: '2026-12-01' })])
    const actions = planDay(MONDAY, [t], state)
    expect(actions[0]).toMatchObject({ kind: 'queued', taskId: 'later' })
  })

  it('continuous threads fall back to a placeholder titled with the thread name', () => {
    const actions = planDay(MONDAY, [thread('c', { frequency: 'daily', name: 'LeetCode' })], freshState())
    expect(actions[0]).toMatchObject({ kind: 'placeholder', title: 'LeetCode', taskId: null })
  })

  it('pulls due-soon and overdue tasks onto today, including backlog tasks', () => {
    const state = freshState([
      task('overdue', 'x', { dueKey: '2026-10-01' }),
      task('soon', null, { dueKey: '2026-10-07' }),
      task('far', null, { dueKey: '2026-10-20' }),
    ])
    const actions = planDay(MONDAY, [thread('x', { taskMode: 'discrete', frequency: 'fixed-day', fixedDay: 4 })], state)
    expect(actions.map(a => a.taskId).sort()).toEqual(['overdue', 'soon'])
    expect(actions.every(a => a.kind === 'due')).toBe(true)
    expect(state.appearances.get('x')).toBe(1)
  })

  it('balances time blocks', () => {
    const threads = ['a', 'b', 'c'].map(id => thread(id, { frequency: 'daily' }))
    const actions = planDay(MONDAY, threads, freshState())
    expect(new Set(actions.map(a => a.timeBlock)).size).toBe(3)
  })
})

describe('grid balancing', () => {
  const load = (actions: ReturnType<typeof planDay>) =>
    actions.reduce((sum, a) => sum + ({ light: 1, medium: 2, heavy: 4 }[a.intensity]), 0)

  it('caps a day at maxDailyIntensity', () => {
    const threads = Array.from({ length: 10 }, (_, i) => thread(`d${i}`, { frequency: 'daily' }))
    const actions = planDay(MONDAY, threads, freshState(), { maxDailyIntensity: 6 })
    expect(actions).toHaveLength(3) // 3 × medium(2) = 6
    expect(load(actions)).toBeLessThanOrEqual(6)
  })

  it('counts tasks already on the day', () => {
    const threads = Array.from({ length: 10 }, (_, i) => thread(`d${i}`, { frequency: 'daily' }))
    const state = { ...freshState(), dayLoad: 4 }
    expect(planDay(MONDAY, threads, state, { maxDailyIntensity: 6 })).toHaveLength(1)
  })

  it('no cap when maxDailyIntensity is not set', () => {
    const threads = Array.from({ length: 10 }, (_, i) => thread(`d${i}`, { frequency: 'daily' }))
    expect(planDay(MONDAY, threads, freshState())).toHaveLength(10)
  })

  it('due tasks and fixed-day threads are placed even over the cap', () => {
    const state = freshState([task('due', null, { dueKey: MONDAY, intensity: 'heavy' })])
    const threads = [
      thread('fixed', { frequency: 'fixed-day', fixedDay: 0, intensity: 'heavy' }),
      thread('d', { frequency: 'daily' }),
    ]
    const actions = planDay(MONDAY, threads, state, { maxDailyIntensity: 2 })
    expect(actions.map(a => a.taskId ?? a.threadId).sort()).toEqual(['due', 'fixed'])
  })

  it('prefers light work once the day is busy', () => {
    const threads = ['H1', 'H2', 'L1', 'L2'].map(id =>
      thread(id, { name: id, frequency: 'daily', intensity: id.startsWith('H') ? 'heavy' : 'light' }))
    const preferLow = planDay(MONDAY, threads, freshState(), { maxDailyIntensity: 8, preferLowIntensityOnBusyDays: true })
    expect(preferLow.map(a => a.threadId)).toEqual(['H1', 'L1', 'L2'])
    const plain = planDay(MONDAY, threads, freshState(), { maxDailyIntensity: 8, preferLowIntensityOnBusyDays: false })
    expect(plain.map(a => a.threadId)).toEqual(['H1', 'H2'])
  })

  it('picks a lighter queued task when the top one does not fit', () => {
    const t = thread('x', { taskMode: 'discrete', frequency: 'daily' })
    const state = {
      ...freshState([
        task('big', 'x', { priority: 'high', intensity: 'heavy' }),
        task('small', 'x', { priority: 'low', intensity: 'light' }),
      ]),
      dayLoad: 4,
    }
    const actions = planDay(MONDAY, [t], state, { maxDailyIntensity: 6 })
    expect(actions[0]).toMatchObject({ taskId: 'small' })
  })

  it('threads squeezed out early in the week catch up later', () => {
    const threads = Array.from({ length: 6 }, (_, i) => thread(`m${i}abc`, { frequency: 'multiple' }))
    const state = freshState()
    let total = 0
    for (let i = 0; i < 7; i++) {
      state.blockLoads = { morning: 0, afternoon: 0, evening: 0 }
      state.dayLoad = 0
      const actions = planDay(addDaysKey(MONDAY, i), threads, state, { maxDailyIntensity: 6 })
      expect(load(actions)).toBeLessThanOrEqual(6)
      total += actions.length
    }
    // 6 threads × 3/week = 18 wanted; cap allows 3/day = 21 slots, so all fit
    expect(total).toBe(18)
  })
})
