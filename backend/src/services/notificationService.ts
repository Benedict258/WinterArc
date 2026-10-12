import webpush from 'web-push'
import { PushSubscription } from '../models/PushSubscription'
import { NotificationLog } from '../models/NotificationLog'
import { Settings } from '../models/Settings'
import { Task } from '../models/Task'
import { DEFAULT_NOTIFICATIONS, planNotifications, localClock, type NotificationSettings, type NotifTask } from '../../../src/shared/notificationPlan'
import { dayKeyToDate, addDaysKey, dateToDayKey, ensureTodayGenerated, DEFAULT_TIMEZONE } from './dailyGenerationService'

let configured = false

/** VAPID keys come from the environment (`npm run push:keys` prints a pair). */
export function pushConfigured() {
  if (configured) return true
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null

type Payload = { title: string; body: string; url: string; tag?: string }

/** Send to every registered device; drop subscriptions the push service says are gone. */
export async function sendToAll(payload: Payload): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 }
  const subs = await PushSubscription.find()
  let sent = 0
  let removed = 0
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } }, JSON.stringify(payload))
      sent++
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id })
        removed++
      } else {
        console.error('Push failed:', error?.statusCode ?? error?.message)
      }
    }
  }))
  return { sent, removed }
}

export async function loadNotificationSettings(): Promise<{ timeZone: string; settings: NotificationSettings }> {
  const doc = await Settings.findOne()
  const n: any = doc?.notifications
  return {
    timeZone: doc?.timezone || DEFAULT_TIMEZONE,
    settings: {
      dailyPlan: { ...DEFAULT_NOTIFICATIONS.dailyPlan, ...(n?.dailyPlan?.toObject?.() ?? n?.dailyPlan) },
      dueTasks: { ...DEFAULT_NOTIFICATIONS.dueTasks, ...(n?.dueTasks?.toObject?.() ?? n?.dueTasks) },
      eventReminders: { ...DEFAULT_NOTIFICATIONS.eventReminders, ...(n?.eventReminders?.toObject?.() ?? n?.eventReminders) },
    },
  }
}

const toNotifTask = (t: any): NotifTask => ({
  id: String(t._id),
  title: t.title,
  status: t.status,
  isEvent: !!t.isEvent,
  startTime: t.startTime ?? null,
  dueKey: t.dueDate ? dateToDayKey(new Date(t.dueDate)) : null,
})

/**
 * One scheduler pass: work out which reminders are due now and send each once.
 * Safe to call as often as you like (every minute, or on a pinger hit).
 */
export async function runNotificationTick(now = new Date()): Promise<{ sent: string[] }> {
  if (!pushConfigured() || (await PushSubscription.countDocuments()) === 0) return { sent: [] }

  const { timeZone, settings } = await loadNotificationSettings()
  const { dayKey } = localClock(now, timeZone)
  await ensureTodayGenerated(now)

  const day = dayKeyToDate(dayKey)
  const [today, dueSoon] = await Promise.all([
    Task.find({ date: { $gte: day, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
    Task.find({ status: 'pending', dueDate: { $ne: null, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
  ])

  const due = planNotifications({ now, timeZone, settings, today: today.map(toNotifTask), dueSoon: dueSoon.map(toNotifTask) })
  const sent: string[] = []
  for (const n of due) {
    try {
      await NotificationLog.create({ key: n.key }) // unique: only the first claimant sends
    } catch (error: any) {
      if (error?.code === 11000) continue
      throw error
    }
    await sendToAll({ title: n.title, body: n.body, url: n.url, tag: n.key })
    sent.push(n.key)
  }
  return { sent }
}

let timer: NodeJS.Timeout | null = null
/** Check every minute while the server is awake (an external pinger keeps it awake on free hosting). */
export function startNotificationScheduler() {
  if (timer) return
  timer = setInterval(() => {
    runNotificationTick().catch(err => console.error('Notification tick failed:', err instanceof Error ? err.message : err))
  }, 60_000)
  timer.unref()
}
