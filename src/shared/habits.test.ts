import { describe, it, expect } from 'vitest'
import { streaks, periodStats, monthlyStats, milestoneFor, habitProblem, isDone, addDays, ALL_DAYS, type HabitRule } from './habits'

const daily: HabitRule = { weekdays: ALL_DAYS, target: 1 }
const vals = (...days: [string, number][]) => new Map(days)
const run = (from: string, n: number, v = 1): [string, number][] => Array.from({ length: n }, (_, i) => [addDays(from, i), v])

describe('streaks', () => {
  const today = '2026-10-16' // Friday
  it('counts consecutive done days up to today', () => {
    expect(streaks(daily, vals(...run('2026-10-10', 7)), today)).toEqual({ current: 7, best: 7, start: '2026-10-10' })
  })
  it('today still open does not break the run', () => {
    expect(streaks(daily, vals(...run('2026-10-10', 6)), today)).toMatchObject({ current: 6, best: 6, start: '2026-10-10' })
  })
  it('a missed scheduled day breaks it, and best remembers the longer earlier run', () => {
    const v = vals(...run('2026-10-01', 5), ...run('2026-10-14', 3)) // gap on the 6th..13th
    expect(streaks(daily, v, today)).toMatchObject({ current: 3, best: 5, start: '2026-10-14' })
  })
  it('yesterday missed means the run is over (today open, but yesterday was due)', () => {
    expect(streaks(daily, vals(...run('2026-10-10', 4)), today).current).toBe(0)
  })
  it('days the habit is not expected on do not break it', () => {
    const weekdays: HabitRule = { weekdays: [1, 2, 3, 4, 5], target: 1 }
    // Mon 12th … Fri 16th done, plus the previous Fri 9th and Thu 8th; the weekend between is skipped
    const v = vals(['2026-10-08', 1], ['2026-10-09', 1], ...run('2026-10-12', 5))
    expect(streaks(weekdays, v, today)).toMatchObject({ current: 7, best: 7 })
  })
  it('doing it on an off day extends the run', () => {
    const weekdays: HabitRule = { weekdays: [1, 2, 3, 4, 5], target: 1 }
    const v = vals(['2026-10-09', 1], ['2026-10-10', 1], ['2026-10-11', 1], ...run('2026-10-12', 5))
    expect(streaks(weekdays, v, today).current).toBe(8)
  })
  it('a count habit is done only when it reaches the target', () => {
    const water: HabitRule = { weekdays: ALL_DAYS, target: 8 }
    expect(isDone(water, 7)).toBe(false)
    expect(streaks(water, vals(['2026-10-15', 8], ['2026-10-14', 5], ['2026-10-13', 8]), today).current).toBe(1)
  })
  it('no logs → zero', () => {
    expect(streaks(daily, vals(), today)).toEqual({ current: 0, best: 0, start: null })
  })
})

describe('stats', () => {
  it('rates and averages over a period, clamped to when the habit started', () => {
    const v = vals(...run('2026-10-05', 3), ['2026-10-09', 1])
    const p = periodStats(daily, v, '2026-10-01', '2026-10-10', '2026-10-05') // 6 days since start
    expect(p.scheduled).toBe(6)
    expect(p.done).toBe(4)
    expect(p.rate).toBeCloseTo(4 / 6)
    expect(p.total).toBe(4)
  })
  it('an unexpected day done never pushes the rate over 100%', () => {
    const wk: HabitRule = { weekdays: [1], target: 1 }
    const p = periodStats(wk, vals(['2026-10-10', 1], ['2026-10-12', 1]), '2026-10-10', '2026-10-12', '2026-10-01')
    expect(p.rate).toBe(1)
  })
  it('monthly rows run newest first and stop before the habit existed', () => {
    const v = vals(...run('2026-09-01', 30), ...run('2026-10-01', 16))
    const rows = monthlyStats(daily, v, '2026-10-16', '2026-09-01')
    expect(rows.map(r => r.month)).toEqual(['2026-10', '2026-09'])
    expect(rows[0]).toMatchObject({ scheduled: 16, done: 16, rate: 1 })
    expect(rows[1]).toMatchObject({ scheduled: 30, done: 30 })
  })
  it('this month so far counts only days up to today', () => {
    const rows = monthlyStats(daily, vals(...run('2026-10-01', 8)), '2026-10-16', '2026-10-01')
    expect(rows[0].scheduled).toBe(16)
    expect(rows[0].rate).toBeCloseTo(0.5)
  })
})

describe('milestones and validation', () => {
  it('finds the highest milestone reached', () => {
    expect([0, 2, 3, 6, 7, 29, 30, 99, 100, 5000].map(milestoneFor)).toEqual([0, 0, 3, 3, 7, 21, 30, 75, 100, 1000])
  })
  it('validates habits', () => {
    const ok = { name: 'Read', weekdays: [1, 2], target: 1, unit: 'pages', emoji: '📚' }
    expect(habitProblem(ok)).toBeNull()
    expect(habitProblem({ ...ok, name: ' ' })).not.toBeNull()
    expect(habitProblem({ ...ok, weekdays: [] })).not.toBeNull()
    expect(habitProblem({ ...ok, weekdays: [1, 1] })).not.toBeNull()
    expect(habitProblem({ ...ok, target: 0 })).not.toBeNull()
    expect(habitProblem({ ...ok, target: 1.5 })).not.toBeNull()
    expect(habitProblem({ ...ok, unit: 'x'.repeat(17) })).not.toBeNull()
    expect(habitProblem({ ...ok, emoji: 'abc' })).not.toBeNull()
  })
})
