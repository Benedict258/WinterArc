import { FocusSession } from '../models/FocusSession'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { DEFAULT_TIMEZONE, addDaysKey, toDayKey } from './dailyGenerationService'

export class FocusError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export type FocusInput = { startedAt: string; minutes: number; taskId?: string | null; label?: string; clientId?: string }

/** Record a finished focus round. Sending the same clientId again returns the same session (retries are safe). */
export async function logSession(userId: string, input: FocusInput) {
  const startedAt = new Date(input.startedAt)
  if (Number.isNaN(startedAt.getTime()) || startedAt.getTime() > Date.now() + 5 * 60_000) throw new FocusError(400, 'That start time isn’t valid')
  if (input.taskId && !(await Task.exists({ _id: input.taskId, userId }))) throw new FocusError(404, 'Task not found')
  if (input.clientId) {
    const seen = await FocusSession.findOne({ userId, clientId: input.clientId })
    if (seen) return { id: String(seen._id), duplicate: true }
  }
  try {
    const doc = await FocusSession.create({ userId, startedAt, minutes: input.minutes, taskId: input.taskId ?? null, label: (input.label ?? '').trim().slice(0, 80), clientId: input.clientId })
    return { id: String(doc._id), duplicate: false }
  } catch (e: any) {
    if (e?.code === 11000 && input.clientId) {
      const existing = await FocusSession.findOne({ userId, clientId: input.clientId })
      return { id: String(existing?._id), duplicate: true }
    }
    throw e
  }
}

export async function deleteSession(userId: string, id: string) {
  const doc = await FocusSession.findOneAndDelete({ _id: id, userId })
  if (!doc) throw new FocusError(404, 'Session not found')
  return { ok: true }
}

/** Minutes per local day for the last 7 days, today's total, and the run of days in a row with at least one round. */
export function summarize(sessions: { startedAt: Date; minutes: number }[], timezone: string, now = new Date()) {
  const today = toDayKey(now, timezone)
  const perDay = new Map<string, { minutes: number; rounds: number }>()
  for (const s of sessions) {
    const k = toDayKey(s.startedAt, timezone)
    const cur = perDay.get(k) ?? { minutes: 0, rounds: 0 }
    cur.minutes += s.minutes; cur.rounds += 1
    perDay.set(k, cur)
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDaysKey(today, i - 6)
    return { day, minutes: perDay.get(day)?.minutes ?? 0, rounds: perDay.get(day)?.rounds ?? 0 }
  })
  // Today not having a round yet doesn't break the streak
  let streak = 0
  let cursor = perDay.has(today) ? today : addDaysKey(today, -1)
  while (perDay.has(cursor)) { streak += 1; cursor = addDaysKey(cursor, -1) }
  return { todayMinutes: perDay.get(today)?.minutes ?? 0, todayRounds: perDay.get(today)?.rounds ?? 0, week, weekMinutes: week.reduce((n, d) => n + d.minutes, 0), streak }
}

export async function getSummary(userId: string, now = new Date()) {
  const settings = await Settings.findOne({ userId }, { timezone: 1 })
  const timezone = settings?.timezone || DEFAULT_TIMEZONE
  const since = new Date(now.getTime() - 400 * 86_400_000)
  const sessions = await FocusSession.find({ userId, startedAt: { $gte: since } }).sort({ startedAt: -1 }).limit(5000)
  const recent = sessions.slice(0, 20).map(s => ({ id: String(s._id), startedAt: s.startedAt, minutes: s.minutes, label: s.label, taskId: s.taskId ? String(s.taskId) : null }))
  return { ...summarize(sessions, timezone, now), recent }
}
