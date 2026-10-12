import { describe, it, expect } from 'vitest'
import { quarterRange, computeStreak, completionStats } from './analyticsService'

const TZ = 'Africa/Lagos' // UTC+1

describe('quarterRange', () => {
  it('finds the quarter in the user timezone, not the server one', () => {
    // 23:30 UTC on Mar 31 is already Apr 1 in Lagos → Q2
    expect(quarterRange(new Date('2026-03-31T23:30:00Z'), TZ).label).toBe('Q2-2026')
    expect(quarterRange(new Date('2026-03-31T22:30:00Z'), TZ).label).toBe('Q1-2026')
  })
  it('covers the whole quarter, including its last day', () => {
    const { start, end } = quarterRange(new Date('2026-11-10T12:00:00Z'), TZ)
    expect(start.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-31T23:59:59.999Z')
  })
  it('rolls over the year for Q4', () => {
    expect(quarterRange(new Date('2026-12-31T12:00:00Z'), TZ).label).toBe('Q4-2026')
  })
})

describe('computeStreak', () => {
  const now = new Date('2026-10-12T10:00:00Z')
  const at = (iso: string) => new Date(iso)

  it('counts consecutive days ending today', () => {
    expect(computeStreak([at('2026-10-12T08:00:00Z'), at('2026-10-11T20:00:00Z'), at('2026-10-10T09:00:00Z')], TZ, now)).toBe(3)
  })
  it('stays alive when today is not done yet', () => {
    expect(computeStreak([at('2026-10-11T08:00:00Z'), at('2026-10-10T08:00:00Z')], TZ, now)).toBe(2)
  })
  it('breaks on a missed day', () => {
    expect(computeStreak([at('2026-10-12T08:00:00Z'), at('2026-10-10T08:00:00Z')], TZ, now)).toBe(1)
  })
  it('is zero with nothing recent', () => {
    expect(computeStreak([at('2026-10-01T08:00:00Z'), null, undefined], TZ, now)).toBe(0)
  })
  it('uses the user timezone for day boundaries', () => {
    // 23:30 UTC Oct 11 is Oct 12 00:30 in Lagos → counts as today
    expect(computeStreak([at('2026-10-11T23:30:00Z')], TZ, now)).toBe(1)
  })
})

describe('completionStats', () => {
  it('ignores skipped tasks', () => {
    expect(completionStats([{ status: 'done' }, { status: 'pending' }, { status: 'skipped' }])).toEqual({ completed: 1, total: 2, rate: 50 })
  })
  it('handles no tasks', () => {
    expect(completionStats([])).toEqual({ completed: 0, total: 0, rate: 0 })
  })
})
