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
