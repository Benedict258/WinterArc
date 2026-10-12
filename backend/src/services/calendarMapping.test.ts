import { describe, it, expect } from 'vitest'
import { googleEventToTask, taskToGoogleEvent, localParts } from './calendarMapping'

const TZ = 'Africa/Lagos' // UTC+1

describe('googleEventToTask', () => {
  const base = { id: 'g1', summary: 'Standup', start: { dateTime: '2026-10-12T08:30:00Z' }, end: { dateTime: '2026-10-12T09:15:00Z' } }

  it('converts to local day, times and block', () => {
    const t = googleEventToTask(base, TZ)!
    expect(t).toMatchObject({ title: 'Standup', dayKey: '2026-10-12', startTime: '09:30', endTime: '10:15', timeBlock: 'morning', calendarEventId: 'g1' })
    expect(t.date.toISOString()).toBe('2026-10-12T00:00:00.000Z')
  })
  it('uses the local day, not the UTC day', () => {
    expect(googleEventToTask({ ...base, start: { dateTime: '2026-10-12T23:30:00Z' }, end: { dateTime: '2026-10-13T00:30:00Z' } }, TZ)!.dayKey).toBe('2026-10-13')
  })
  it('clips events that run past midnight', () => {
    const t = googleEventToTask({ ...base, start: { dateTime: '2026-10-12T21:00:00Z' }, end: { dateTime: '2026-10-13T03:00:00Z' } }, TZ)!
    expect(t).toMatchObject({ startTime: '22:00', endTime: '23:59', timeBlock: 'evening' })
  })
  it('skips all-day, cancelled and self-pushed events', () => {
    expect(googleEventToTask({ ...base, start: { date: '2026-10-12' } }, TZ)).toBeNull()
    expect(googleEventToTask({ ...base, status: 'cancelled' }, TZ)).toBeNull()
    expect(googleEventToTask({ ...base, extendedProperties: { private: { source: 'workspace' } } }, TZ)).toBeNull()
  })
})

describe('taskToGoogleEvent', () => {
  it('sends local wall time with the zone and a marker so it is not re-imported', () => {
    const e = taskToGoogleEvent({ _id: 'abc', title: 'Study group', startTime: '18:30', endTime: '20:00' }, '2026-10-12', TZ)
    expect(e.start).toEqual({ dateTime: '2026-10-12T18:30:00', timeZone: TZ })
    expect(e.end).toEqual({ dateTime: '2026-10-12T20:00:00', timeZone: TZ })
    expect(e.extendedProperties.private).toEqual({ workspaceTaskId: 'abc', source: 'workspace' })
  })
  it('never ends before it starts', () => {
    expect(taskToGoogleEvent({ _id: 'a', title: 'x', startTime: '18:00', endTime: '17:00' }, '2026-10-12', TZ).end.dateTime).toBe('2026-10-12T18:00:00')
  })
})

describe('localParts', () => {
  it('formats in the target zone', () => {
    expect(localParts('2026-10-12T23:30:00Z', TZ)).toEqual({ dayKey: '2026-10-13', time: '00:30' })
  })
})
