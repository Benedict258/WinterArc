// Decides which reminders are due right now. Pure (no DB, no browser APIs) so the
// server's push scheduler and the native app's local scheduler share one rule set.

export type NotificationSettings = {
  dailyPlan: { enabled: boolean; time: string } // 'HH:mm' in the user's timezone
  dueTasks: { enabled: boolean }
  eventReminders: { enabled: boolean; minutesBefore: number }
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  dailyPlan: { enabled: true, time: '07:30' },
  dueTasks: { enabled: true },
  eventReminders: { enabled: true, minutesBefore: 15 },
}

export type NotifTask = {
  id: string
  title: string
  status: string
  isEvent?: boolean
  startTime?: string | null
  /** 'YYYY-MM-DD' */
  dueKey?: string | null
}

export type PlannedNotification = {
  /** Stable per occurrence; used to send each reminder once */
  key: string
  title: string
  body: string
  url: string
  /** Minutes-of-day the reminder is meant for (used by schedulers that fire ahead of time) */
  atMinutes: number
}

/** How long after its scheduled minute a reminder may still fire (server was asleep, app was closed). */
export const GRACE_MINUTES = 180
const EVENT_GRACE_MINUTES = 5

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 'YYYY-MM-DD' and minutes-of-day for `now` in `timeZone`. */
export function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function planNotifications(input: {
  now: Date
  timeZone: string
  settings: NotificationSettings
  /** every task on today's date (events included) */
  today: NotifTask[]
  /** pending tasks with a due date on or before today, anywhere */
  dueSoon: NotifTask[]
}): PlannedNotification[] {
  const { now, timeZone, settings, today, dueSoon } = input
  const { dayKey, minutes } = localClock(now, timeZone)
  const out: PlannedNotification[] = []

  if (settings.dailyPlan.enabled) {
    const at = toMinutes(settings.dailyPlan.time)
    if (minutes >= at && minutes - at <= GRACE_MINUTES) {
      const pending = today.filter(t => t.status === 'pending')
      const events = pending.filter(t => t.isEvent).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
      const tasks = pending.filter(t => !t.isEvent)
      const lines: string[] = []
      if (tasks.length) lines.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${tasks.slice(0, 3).map(t => t.title).join(', ')}${tasks.length > 3 ? '…' : ''}`)
      if (events.length) lines.push(events.map(e => `${e.startTime ?? ''} ${e.title}`.trim()).join(' · '))
      if (settings.dueTasks.enabled && dueSoon.length) {
        const overdue = dueSoon.filter(t => (t.dueKey ?? dayKey) < dayKey).length
        const dueToday = dueSoon.length - overdue
        const bits = [dueToday ? `${dueToday} due today` : '', overdue ? `${overdue} overdue` : ''].filter(Boolean)
        if (bits.length) lines.push(bits.join(', '))
      }
      out.push({
        key: `plan:${dayKey}`,
        title: lines.length ? 'Your day' : 'Your day is clear',
        body: lines.join('\n') || 'Nothing scheduled yet.',
        url: '/',
        atMinutes: at,
      })
    }
  }

  if (settings.eventReminders.enabled) {
    const before = settings.eventReminders.minutesBefore
    for (const e of today) {
      if (!e.isEvent || e.status !== 'pending' || !e.startTime) continue
      const start = toMinutes(e.startTime)
      const remindAt = start - before
      if (minutes >= remindAt && minutes < start + EVENT_GRACE_MINUTES) {
        out.push({
          key: `event:${e.id}:${dayKey}`,
          title: e.title,
          body: minutes < start ? `Starts at ${e.startTime} (in ${start - minutes} min)` : `Started at ${e.startTime}`,
          url: '/',
          atMinutes: remindAt,
        })
      }
    }
  }

  return out
}
