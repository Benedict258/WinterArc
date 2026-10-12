import { describe, it, expect } from 'vitest'
import { planNotifications, DEFAULT_NOTIFICATIONS, type NotifTask } from './notificationPlan'

const TZ = 'Africa/Lagos' // UTC+1
const at = (hhmmLocal: string) => {
  const [h, m] = hhmmLocal.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, 12, h - 1, m)) // Oct 12 2026, Lagos wall time
}
const task = (id: string, o: Partial<NotifTask> = {}): NotifTask => ({ id, title: `T${id}`, status: 'pending', ...o })
const run = (time: string, today: NotifTask[], dueSoon: NotifTask[] = [], settings = DEFAULT_NOTIFICATIONS) =>
  planNotifications({ now: at(time), timeZone: TZ, settings, today, dueSoon })

describe('daily plan', () => {
  it('waits for the configured time', () => {
    expect(run('07:00', [task('1')])).toHaveLength(0)
  })
  it('fires at the time, summarising tasks, events and due items', () => {
    const [n] = run('07:30', [task('1'), task('e', { isEvent: true, startTime: '18:00', title: 'Study group' })], [task('d', { dueKey: '2026-10-12' }), task('o', { dueKey: '2026-10-10' })])
    expect(n.key).toBe('plan:2026-10-12')
    expect(n.body).toContain('1 task: T1')
    expect(n.body).toContain('18:00 Study group')
    expect(n.body).toContain('1 due today, 1 overdue')
  })
  it('skips a plan that is hours stale', () => {
    expect(run('12:00', [task('1')])).toHaveLength(0)
  })
  it('can be turned off', () => {
    expect(run('07:30', [task('1')], [], { ...DEFAULT_NOTIFICATIONS, dailyPlan: { enabled: false, time: '07:30' } })).toHaveLength(0)
  })
})

describe('event reminders', () => {
  const ev = task('e', { isEvent: true, startTime: '18:00', title: 'Study group' })
  it('fires within the lead window, once per day per event', () => {
    expect(run('17:44', [ev])).toHaveLength(0)
    const [n] = run('17:45', [ev])
    expect(n.key).toBe('event:e:2026-10-12')
    expect(n.body).toBe('Starts at 18:00 (in 15 min)')
  })
  it('stops shortly after the start and ignores finished events', () => {
    expect(run('18:10', [ev])).toHaveLength(0)
    expect(run('17:50', [{ ...ev, status: 'done' }])).toHaveLength(0)
  })
})

import { planDigest, minutesUntilNextCheck, MAX_SLEEP_MINUTES } from './notificationPlan'
const withDigest = (enabled: boolean, time = '07:30') => ({ ...DEFAULT_NOTIFICATIONS, emailDigest: { enabled, time } })

describe('email digest', () => {
  it('is off by default', () => {
    expect(planDigest({ now: at('07:30'), timeZone: TZ, settings: DEFAULT_NOTIFICATIONS, today: [task('1')], dueSoon: [] })).toBeNull()
  })
  it('waits for its time, then summarises the day once per day key', () => {
    const input = (time: string) => ({ now: at(time), timeZone: TZ, settings: withDigest(true), today: [task('1'), task('2'), task('e', { isEvent: true, startTime: '18:00', title: 'Class' })], dueSoon: [task('d', { dueKey: '2026-10-12' })] })
    expect(planDigest(input('07:00'))).toBeNull()
    const d = planDigest(input('07:30'))!
    expect(d.key).toBe('email:digest:2026-10-12')
    expect(d.subject).toBe('Your day: 2 tasks, 1 event')
    expect(d.events).toEqual(['18:00 Class'])
    expect(d.dueToday).toBe(1)
    expect(planDigest(input('12:00'))).toBeNull() // hours stale
  })
  it('says so when the day is clear', () => {
    expect(planDigest({ now: at('07:31'), timeZone: TZ, settings: withDigest(true), today: [], dueSoon: [] })!.subject).toBe('Your day is clear')
  })
})

describe('minutesUntilNextCheck', () => {
  const next = (time: string, today: NotifTask[] = [], settings = DEFAULT_NOTIFICATIONS) => minutesUntilNextCheck({ now: at(time), timeZone: TZ, settings, today })
  it('waits for the daily plan', () => {
    expect(next('07:00')).toBe(30)
  })
  it('after the daily plan, sleeps up to the cap rather than a whole day', () => {
    expect(next('08:00')).toBe(MAX_SLEEP_MINUTES)
  })
  it('wakes for an event reminder that is sooner', () => {
    expect(next('08:00', [task('e', { isEvent: true, startTime: '09:00' })])).toBe(45) // 09:00 - 15 min
  })
  it('ignores finished events and past reminders', () => {
    expect(next('08:00', [task('e', { isEvent: true, startTime: '09:00', status: 'done' })])).toBe(MAX_SLEEP_MINUTES)
    expect(next('10:00', [task('e', { isEvent: true, startTime: '09:00' })])).toBe(MAX_SLEEP_MINUTES)
  })
  it('includes the email digest time', () => {
    expect(next('07:40', [], { ...withDigest(true, '08:00'), dailyPlan: { enabled: false, time: '07:30' } })).toBe(20)
  })
  it('is at least one minute', () => {
    expect(next('07:30')).toBeGreaterThanOrEqual(1)
  })
})
