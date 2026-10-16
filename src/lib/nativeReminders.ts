import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import { isNative } from './native'
import { getCachedTasks, getCachedSettings } from './storage'
import { QUEUE_FLUSHED } from './syncQueue'
import { DEFAULT_NOTIFICATIONS, planNotifications, toMinutes, type NotificationSettings, type NotifTask } from '@/shared/notificationPlan'

// The phone schedules its own reminders (no server push needed, works offline).
// Every time the app opens, returns to the foreground, or finishes syncing, it
// rebuilds the next DAYS days of reminders from the latest data it has.

const DAYS = 7
const MAX_SCHEDULED = 60

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const atLocal = (key: string, minutes: number) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60)
}
const stableId = (key: string) => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  return Math.abs(h) % 2_000_000_000 + 1
}

async function loadSettings(): Promise<NotificationSettings> {
  let n: any = null
  try {
    const res = await fetch('/api/settings')
    if (res.ok) n = (await res.json()).notifications
  } catch { /* offline */ }
  n = n ?? (await getCachedSettings())?.notifications
  return {
    dailyPlan: { ...DEFAULT_NOTIFICATIONS.dailyPlan, ...n?.dailyPlan },
    dueTasks: { ...DEFAULT_NOTIFICATIONS.dueTasks, ...n?.dueTasks },
    eventReminders: { ...DEFAULT_NOTIFICATIONS.eventReminders, ...n?.eventReminders },
    emailDigest: { ...DEFAULT_NOTIFICATIONS.emailDigest, ...n?.emailDigest },
    habits: { ...DEFAULT_NOTIFICATIONS.habits!, ...n?.habits },
  }
}

/** Tasks per upcoming day: real tasks for today, the server's forecast for later days. */
async function loadDays(start: Date): Promise<Map<string, NotifTask[]>> {
  const days = new Map<string, NotifTask[]>()
  const todayKey = dayKey(start)
  const keys = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  keys.forEach(k => days.set(k, []))

  const cached = await getCachedTasks()
  for (const t of cached) {
    const key = typeof t.date === 'string' ? t.date.slice(0, 10) : null
    if (key === todayKey) {
      days.get(key)!.push({ id: String(t._id), title: t.title, status: t.status, isEvent: !!t.isEvent, startTime: t.startTime ?? null, dueKey: t.dueDate ? String(t.dueDate).slice(0, 10) : null })
    }
  }

  for (const weekStart of new Set(keys.map(k => mondayOf(k)))) {
    try {
      const res = await fetch(`/api/grid/week/${weekStart}`)
      if (!res.ok) continue
      const { forecast = [] } = await res.json()
      for (const f of forecast) {
        if (f.date === todayKey || !days.has(f.date)) continue
        days.get(f.date)!.push({ id: `${f.date}:${f.threadId ?? f.title}`, title: f.title, status: 'pending', isEvent: f.kind === 'event', startTime: f.startTime ?? null, dueKey: f.dueKey ?? null })
      }
    } catch { /* offline: keep what we have */ }
  }
  return days
}

function mondayOf(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

/** A nudge at the habit reminder time on each upcoming day that has habits due (today's only if some are still open). */
async function habitReminders(settings: NotificationSettings, now: Date): Promise<{ id: number; title: string; body: string; at: Date }[]> {
  if (!settings.habits?.enabled) return []
  let habits: { weekdays: number[]; today: { scheduled: boolean; done: boolean } }[] = []
  try {
    const res = await fetch('/api/habits')
    if (!res.ok) return []
    habits = (await res.json()).habits
  } catch { return [] } // offline: skip rather than guess
  const out: { id: number; title: string; body: string; at: Date }[] = []
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const key = dayKey(day)
    const at = atLocal(key, toMinutes(settings.habits.time))
    if (at <= now) continue
    const due = habits.filter(h => h.weekdays.includes(day.getDay()))
    const open = i === 0 ? due.filter(h => !h.today.done) : due
    if (open.length === 0) continue
    out.push({ id: stableId(`habits:${key}`), title: open.length === 1 ? 'One habit left today' : 'Check in on your habits', body: i === 0 ? `${open.length} still open` : 'Tap to log how today went', at })
  }
  return out
}

export async function scheduleReminders() {
  if (!isNative()) return
  const perm = await LocalNotifications.checkPermissions()
  if (perm.display !== 'granted') return

  const now = new Date()
  const settings = await loadSettings()
  const days = await loadDays(now)
  const timeZone = deviceZone()
  const upcoming: { id: number; title: string; body: string; at: Date }[] = []

  for (const [key, tasks] of days) {
    // Ask the shared planner what it would send at each candidate minute of that day
    const candidates = new Set<number>()
    if (settings.dailyPlan.enabled) candidates.add(toMinutes(settings.dailyPlan.time))
    if (settings.eventReminders.enabled) {
      for (const t of tasks) if (t.isEvent && t.startTime) candidates.add(toMinutes(t.startTime) - settings.eventReminders.minutesBefore)
    }
    const dueSoon = tasks.filter(t => t.dueKey && t.dueKey <= key && t.status === 'pending')
    const seen = new Set<string>()
    for (const minutes of candidates) {
      const at = atLocal(key, minutes)
      if (at <= now) continue
      for (const n of planNotifications({ now: at, timeZone, settings, today: tasks, dueSoon })) {
        if (seen.has(n.key)) continue
        seen.add(n.key)
        upcoming.push({ id: stableId(n.key), title: n.title, body: n.body, at })
      }
    }
  }

  upcoming.push(...(await habitReminders(settings, now)))

  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications })
  const chosen = upcoming.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED)
  if (chosen.length) {
    await LocalNotifications.schedule({
      notifications: chosen.map(n => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, smallIcon: 'ic_stat_notify' })),
    })
  }
}

export const nativeNotificationsGranted = async () => (await LocalNotifications.checkPermissions()).display === 'granted'

export async function requestNativeNotifications() {
  const result = await LocalNotifications.requestPermissions()
  if (result.display === 'granted') await scheduleReminders()
  return result.display === 'granted'
}

/** Re-plan on launch, when returning to the app, and after offline changes sync. */
export const DATA_CHANGED = 'winterarc-data-changed'

export function startNativeReminders() {
  if (!isNative()) return
  const run = () => { scheduleReminders().catch(err => console.warn('Scheduling reminders failed:', err)) }
  // Edits can arrive in bursts; wait for them to settle
  let timer: ReturnType<typeof setTimeout> | undefined
  const runSoon = () => { clearTimeout(timer); timer = setTimeout(run, 2000) }
  run()
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) run() })
  window.addEventListener(QUEUE_FLUSHED, runSoon)
  window.addEventListener(DATA_CHANGED, runSoon)
}
