import { describe, it, expect } from 'vitest'
import { routineProblem, weekdayOfDayKey, routineRunsOn, routineKey, addMinutes, normalizeRoutine, type RoutineInput } from './routines'

const ok = (): RoutineInput => ({
  name: ' Morning ', weekdays: [1, 3, 5], autoAdd: true,
  items: [{ id: 'a1', title: ' Stretch ', startTime: '07:00', minutes: 10, intensity: 'light' }, { id: 'b2', title: 'Read', startTime: null, minutes: null, intensity: 'medium' }],
})

describe('routines', () => {
  it('accepts a good routine and tidies it', () => {
    expect(routineProblem(ok())).toBeNull()
    const n = normalizeRoutine(ok())
    expect(n.name).toBe('Morning')
    expect(n.items[0].title).toBe('Stretch')
  })

  it.each([
    ['no name', (r: any) => { r.name = '  ' }],
    ['duplicate weekday', (r: any) => { r.weekdays = [1, 1] }],
    ['weekday out of range', (r: any) => { r.weekdays = [7] }],
    ['no steps', (r: any) => { r.items = [] }],
    ['bad time', (r: any) => { r.items[0].startTime = '7am' }],
    ['25:00', (r: any) => { r.items[0].startTime = '25:00' }],
    ['minutes zero', (r: any) => { r.items[0].minutes = 0 }],
    ['duplicate step id', (r: any) => { r.items[1].id = 'a1' }],
    ['bad intensity', (r: any) => { r.items[0].intensity = 'huge' }],
    ['auto-add with no days', (r: any) => { r.weekdays = [] }],
    ['too many steps', (r: any) => { r.items = Array.from({ length: 31 }, (_, i) => ({ id: `s${i}`, title: 'x', startTime: null, minutes: null, intensity: 'light' })) }],
  ])('rejects %s', (_n, mutate) => {
    const r = ok(); mutate(r)
    expect(routineProblem(r)).not.toBeNull()
  })

  it('knows which weekday a day is (no timezone drift)', () => {
    expect(weekdayOfDayKey('2026-10-12')).toBe(1) // Monday
    expect(weekdayOfDayKey('2026-10-18')).toBe(0)
    expect(routineRunsOn({ weekdays: [1] }, '2026-10-12')).toBe(true)
    expect(routineRunsOn({ weekdays: [1] }, '2026-10-13')).toBe(false)
  })

  it('keys and times', () => {
    expect(routineKey('r', 'i')).toBe('r:i')
    expect(addMinutes('07:50', 20)).toBe('08:10')
    expect(addMinutes('23:30', 120)).toBe('23:59')
  })
})
