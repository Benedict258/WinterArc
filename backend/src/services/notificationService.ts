import webpush from 'web-push'
import { PushSubscription } from '../models/PushSubscription'
import { NotificationLog } from '../models/NotificationLog'
import { Settings } from '../models/Settings'
import { Task } from '../models/Task'
import { User } from '../models/User'
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

/** Tests replace the sender so nothing leaves the process. */
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string) => Promise<unknown>
let sender: Sender = (sub, body) => webpush.sendNotification(sub, body)
export const setPushSender = (fn: Sender | null) => { sender = fn ?? ((sub, body) => webpush.sendNotification(sub, body)) }

/** Send to every device this user registered; drop subscriptions the push service says are gone. */
export async function sendToUser(userId: string, payload: Payload): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 }
  const subs = await PushSubscription.find({ userId })
  let sent = 0
  let removed = 0
  await Promise.all(subs.map(async sub => {
    try {
      await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } }, JSON.stringify(payload))
      sent++
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id, userId })
        removed++
      } else {
        console.error('Push failed:', error?.statusCode ?? error?.message)
      }
    }
  }))
  return { sent, removed }
}

export async function loadNotificationSettings(userId: string): Promise<{ timeZone: string; settings: NotificationSettings }> {
  const doc = await Settings.findOne({ userId })
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

/** One user's pass: work out which reminders are due now and send each once. */
export async function runUserTick(userId: string, now = new Date()): Promise<string[]> {
  const { timeZone, settings } = await loadNotificationSettings(userId)
  const { dayKey } = localClock(now, timeZone)
  await ensureTodayGenerated(userId, now)

  const day = dayKeyToDate(dayKey)
  const [today, dueSoon] = await Promise.all([
    Task.find({ userId, date: { $gte: day, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
    Task.find({ userId, status: 'pending', dueDate: { $ne: null, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
  ])

  const due = planNotifications({ now, timeZone, settings, today: today.map(toNotifTask), dueSoon: dueSoon.map(toNotifTask) })
  const sent: string[] = []
  for (const n of due) {
    try {
      await NotificationLog.create({ userId, key: n.key }) // unique per user: only the first claimant sends
    } catch (error: any) {
      if (error?.code === 11000) continue
      throw error
    }
    await sendToUser(userId, { title: n.title, body: n.body, url: n.url, tag: n.key })
    sent.push(n.key)
  }
  return sent
}

const CONCURRENCY = 10

/**
 * Scheduler pass over every user that has a registered device and is still active.
 * Safe to call as often as you like (every minute, or on a pinger hit).
 */
export async function runNotificationTick(now = new Date()): Promise<{ users: number; sent: number }> {
  if (!pushConfigured()) return { users: 0, sent: 0 }
  const ids = (await PushSubscription.distinct('userId', {}).setOptions({ crossUser: true })).map(String)
  if (!ids.length) return { users: 0, sent: 0 }
  const active = await User.find({ _id: { $in: ids }, status: 'active' }, { _id: 1 })
  const users = active.map(u => String(u._id))

  let sent = 0
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const results = await Promise.all(users.slice(i, i + CONCURRENCY).map(id =>
      runUserTick(id, now).catch(err => { console.error('Notification tick failed for a user:', err instanceof Error ? err.message : err); return [] as string[] })
    ))
    sent += results.reduce((n, r) => n + r.length, 0)
  }
  return { users: users.length, sent }
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
