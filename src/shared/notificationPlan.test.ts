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
