import { PushSubscription } from '../models/PushSubscription'
import { sendToUser } from './pushService'
import { runHabitNotifications } from './habitNotifyService'
import { NotificationLog } from '../models/NotificationLog'
import { Settings } from '../models/Settings'
import { Task } from '../models/Task'
import { User } from '../models/User'
import { DEFAULT_NOTIFICATIONS, planNotifications, planDigest, minutesUntilNextCheck, localClock, type NotificationSettings, type NotifTask } from '../../../src/shared/notificationPlan'
import { sendEmail, digestMessage } from './emailService'
import { sweepDropIfDue } from './dropService'
import { sendPlanRemindersIfDue } from './billingService'
import { dayKeyToDate, addDaysKey, dateToDayKey, ensureTodayGenerated, DEFAULT_TIMEZONE } from './dailyGenerationService'

export { pushConfigured, vapidPublicKey, setPushSender, sendToUser } from './pushService'

export async function loadNotificationSettings(userId: string): Promise<{ timeZone: string; settings: NotificationSettings }> {
  const doc = await Settings.findOne({ userId })
  const n: any = doc?.notifications
  const part = (key: keyof NotificationSettings) => ({ ...DEFAULT_NOTIFICATIONS[key], ...(n?.[key]?.toObject?.() ?? n?.[key]) })
  return {
    timeZone: doc?.timezone || DEFAULT_TIMEZONE,
    settings: {
      dailyPlan: part('dailyPlan') as NotificationSettings['dailyPlan'],
      dueTasks: part('dueTasks') as NotificationSettings['dueTasks'],
      eventReminders: part('eventReminders') as NotificationSettings['eventReminders'],
      emailDigest: part('emailDigest') as NotificationSettings['emailDigest'],
      habits: part('habits') as NonNullable<NotificationSettings['habits']>,
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

/** Something changed that could move this user's next reminder (settings, an event, a device): look at them on the next tick. */
export async function markNotificationsDirty(userId: string) {
  await Settings.updateOne({ userId }, { $set: { nextCheckAt: new Date(0) } }).catch(() => {})
}

const IDLE_RECHECK_MS = 24 * 60 * 60 * 1000
const INACTIVE_AFTER_MS = 45 * 24 * 60 * 60 * 1000

/** Claim a once-only key; false when it was already sent (this or another process). */
async function claim(userId: string, key: string) {
  try {
    await NotificationLog.create({ userId, key })
    return true
  } catch (error: any) {
    if (error?.code === 11000) return false
    throw error
  }
}

/**
 * One user's pass: push reminders and the email digest that are due now, each sent once,
 * then work out when they next need looking at. Returns the keys sent.
 */
export async function runUserTick(userId: string, now = new Date()): Promise<string[]> {
  const user = await User.findOne({ _id: userId }, { email: 1, emailVerifiedAt: 1, status: 1, lastSeenAt: 1 })
  const { timeZone, settings } = await loadNotificationSettings(userId)
  const hasDevice = (await PushSubscription.countDocuments({ userId })) > 0
  const wantsDigest = settings.emailDigest.enabled && !!user?.emailVerifiedAt
  const inactive = !user || user.status !== 'active' || (user.lastSeenAt && now.getTime() - new Date(user.lastSeenAt).getTime() > INACTIVE_AFTER_MS)

  // Nothing to deliver, or nobody home: park them until something changes (edits mark them dirty)
  if (inactive || (!hasDevice && !wantsDigest)) {
    await Settings.updateOne({ userId }, { $set: { nextCheckAt: new Date(now.getTime() + IDLE_RECHECK_MS) } })
    return []
  }

  const { dayKey } = localClock(now, timeZone)
  await ensureTodayGenerated(userId, now)

  const day = dayKeyToDate(dayKey)
  const [today, dueSoon] = await Promise.all([
    Task.find({ userId, date: { $gte: day, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
    Task.find({ userId, status: 'pending', dueDate: { $ne: null, $lt: dayKeyToDate(addDaysKey(dayKey, 1)) } }),
  ])
  const todayTasks = today.map(toNotifTask)
  const dueTasks = dueSoon.map(toNotifTask)

  const sent: string[] = []
  if (hasDevice) {
    for (const n of planNotifications({ now, timeZone, settings, today: todayTasks, dueSoon: dueTasks })) {
      if (!(await claim(userId, n.key))) continue
      await sendToUser(userId, { title: n.title, body: n.body, url: n.url, tag: n.key })
      sent.push(n.key)
    }
  }

  if (hasDevice) {
    sent.push(...(await runHabitNotifications(userId, now, localClock(now, timeZone), settings, { claim: key => claim(userId, key), send: p => sendToUser(userId, p) })))
  }

  if (wantsDigest) {
    const digest = planDigest({ now, timeZone, settings, today: todayTasks, dueSoon: dueTasks })
    if (digest && (await claim(userId, digest.key))) {
      try {
        await sendEmail(digestMessage(user!.email, userId, digest))
        sent.push(digest.key)
      } catch (error) {
        await NotificationLog.deleteOne({ userId, key: digest.key }) // let the next pass try again
        console.error('Digest email failed:', error instanceof Error ? error.message : error)
      }
    }
  }

  const minutes = minutesUntilNextCheck({ now, timeZone, settings, today: todayTasks })
  // Start of the current minute plus the wait, so the check lands on the reminder's own minute
  const startOfMinute = Math.floor(now.getTime() / 60_000) * 60_000
  await Settings.updateOne({ userId }, { $set: { nextCheckAt: new Date(startOfMinute + minutes * 60_000) } })
  return sent
}

const CONCURRENCY = 10
const BATCH = 500

/**
 * Scheduler pass: only users whose next check has come (an indexed lookup), not everyone.
 * Safe to call as often as you like (every minute, or on a pinger hit).
 */
export async function runNotificationTick(now = new Date()): Promise<{ users: number; sent: number }> {
  const due = await Settings.find({ nextCheckAt: { $lte: now } }, { userId: 1 })
    .sort({ nextCheckAt: 1 })
    .limit(BATCH)
    .setOptions({ crossUser: true })
  const users = due.map(d => String(d.userId))

  let sent = 0
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const results = await Promise.all(users.slice(i, i + CONCURRENCY).map(id =>
      runUserTick(id, now).catch(err => {
        console.error('Notification tick failed for a user:', err instanceof Error ? err.message : err)
        // try again in a few minutes rather than every tick
        return Settings.updateOne({ userId: id }, { $set: { nextCheckAt: new Date(now.getTime() + 5 * 60_000) } }).then(() => [] as string[])
      })
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
    void sweepDropIfDue()
    void sendPlanRemindersIfDue()
    runNotificationTick().catch(err => console.error('Notification tick failed:', err instanceof Error ? err.message : err))
  }, 60_000)
  timer.unref()
}
