import { Habit } from '../models/Habit'
import { HabitLog } from '../models/HabitLog'
import { Settings } from '../models/Settings'
import { DEFAULT_TIMEZONE, toDayKey } from './dailyGenerationService'
import { sendToUser } from './pushService'
import {
  MAX_HABITS, addDays, habitProblem, isDone, isScheduled, milestoneFor, monthlyStats, periodStats, streaks, type HabitRule,
} from '../../../src/shared/habits'

export class HabitError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const LOOKBACK_DAYS = 400
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export async function todayFor(userId: string, now = new Date()) {
  const settings = await Settings.findOne({ userId }, { timezone: 1 })
  return toDayKey(now, settings?.timezone || DEFAULT_TIMEZONE)
}

type HabitDoc = {
  _id: unknown; name: string; emoji?: string; unit?: string; weekdays: number[]; target: number; startedOn: string
  archived?: boolean; bestStreak?: number; lastMilestone?: number; milestoneRunStart?: string | null
}
const ruleOf = (h: HabitDoc): HabitRule => ({ weekdays: h.weekdays, target: h.target })

async function valuesFor(userId: string, habitIds: unknown[], since: string) {
  const logs = await HabitLog.find({ userId, habitId: { $in: habitIds }, day: { $gte: since } }, { habitId: 1, day: 1, value: 1 })
  const byHabit = new Map<string, Map<string, number>>()
  for (const l of logs) {
    const k = String(l.habitId)
    if (!byHabit.has(k)) byHabit.set(k, new Map())
    byHabit.get(k)!.set(l.day, l.value)
  }
  return byHabit
}

function shape(h: HabitDoc, values: Map<string, number>, today: string) {
  const rule = ruleOf(h)
  const { current, best, start } = streaks(rule, values, today)
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13)
    const value = values.get(day) ?? 0
    return { day, value, done: isDone(rule, value), scheduled: isScheduled(rule, day) }
  })
  const week = periodStats(rule, values, addDays(today, -6), today, h.startedOn)
  const month = monthlyStats(rule, values, today, h.startedOn, 1)[0]
  return {
    id: String(h._id), name: h.name, emoji: h.emoji ?? '', unit: h.unit ?? '', weekdays: h.weekdays, target: h.target, startedOn: h.startedOn,
    today: { value: values.get(today) ?? 0, done: isDone(rule, values.get(today)), scheduled: isScheduled(rule, today) },
    streak: { current, best: Math.max(best, h.bestStreak ?? 0), start },
    last14,
    weekRate: week.rate,
    monthRate: month?.rate ?? 0,
  }
}

export async function listHabits(userId: string, now = new Date()) {
  const today = await todayFor(userId, now)
  const habits = await Habit.find({ userId, archived: false }).sort({ createdAt: 1 })
  const values = await valuesFor(userId, habits.map(h => h._id), addDays(today, -LOOKBACK_DAYS))
  return { today, habits: habits.map(h => shape(h as unknown as HabitDoc, values.get(String(h._id)) ?? new Map(), today)) }
}

/** Month by month across all habits (newest first), plus each habit's own rate. */
export async function monthlyOverview(userId: string, now = new Date(), months = 6) {
  const today = await todayFor(userId, now)
  const habits = await Habit.find({ userId, archived: false }).sort({ createdAt: 1 })
  const values = await valuesFor(userId, habits.map(h => h._id), addDays(today, -(months * 31 + 31)))
  const perHabit = habits.map(h => ({ id: String(h._id), name: h.name, emoji: h.emoji, rows: monthlyStats(ruleOf(h as unknown as HabitDoc), values.get(String(h._id)) ?? new Map(), today, h.startedOn, months) }))
  const totals = new Map<string, { scheduled: number; done: number; total: number }>()
  for (const p of perHabit) for (const r of p.rows) {
    const t = totals.get(r.month) ?? { scheduled: 0, done: 0, total: 0 }
    t.scheduled += r.scheduled; t.done += r.done; t.total += r.total
    totals.set(r.month, t)
  }
  const overall = [...totals.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, t]) => ({ month, rate: t.scheduled ? t.done / t.scheduled : 0, done: t.done, scheduled: t.scheduled }))
  return { today, overall, habits: perHabit }
}

function check(input: unknown) {
  const problem = habitProblem(input)
  if (problem) throw new HabitError(400, problem)
  const x = input as { name: string; emoji?: string | null; unit?: string | null; weekdays: number[]; target: number }
  return { name: x.name.trim(), emoji: x.emoji ?? '', unit: (x.unit ?? '').trim(), weekdays: [...x.weekdays].sort((a, b) => a - b), target: x.target }
}

export async function createHabit(userId: string, input: unknown, now = new Date()) {
  const clean = check(input)
  if ((await Habit.countDocuments({ userId, archived: false })) >= MAX_HABITS) throw new HabitError(409, `You can track up to ${MAX_HABITS} habits. Archive one to add another.`)
  const startedOn = await todayFor(userId, now)
  const doc = await Habit.create({ userId, ...clean, startedOn })
  return shape(doc as unknown as HabitDoc, new Map(), startedOn)
}

export async function updateHabit(userId: string, id: string, input: unknown, now = new Date()) {
  const clean = check(input)
  const doc = await Habit.findOneAndUpdate({ _id: id, userId, archived: false }, { $set: clean }, { new: true })
  if (!doc) throw new HabitError(404, 'Habit not found')
  const today = await todayFor(userId, now)
  const values = (await valuesFor(userId, [doc._id], addDays(today, -LOOKBACK_DAYS))).get(String(doc._id)) ?? new Map()
  return shape(doc as unknown as HabitDoc, values, today)
}

/** Stop tracking but keep the history (it still shows in monthly averages of past months). */
export async function archiveHabit(userId: string, id: string) {
  const doc = await Habit.findOneAndUpdate({ _id: id, userId }, { $set: { archived: true } })
  if (!doc) throw new HabitError(404, 'Habit not found')
  return { ok: true }
}

/** Delete the habit and everything logged for it. */
export async function deleteHabit(userId: string, id: string) {
  const doc = await Habit.findOneAndDelete({ _id: id, userId })
  if (!doc) throw new HabitError(404, 'Habit not found')
  await HabitLog.deleteMany({ userId, habitId: doc._id })
  return { ok: true }
}

export type CheckIn = { day?: string; value?: number; add?: number }
export type CheckInResult = ReturnType<typeof shape> & { milestone: number | null; previousValue: number }

/**
 * Set how much was done on a day (value), or add to what is there (add). Setting the same value again changes nothing,
 * so a retried request is harmless. Reaching a streak milestone for the first time sends a notification.
 */
export async function checkIn(userId: string, id: string, input: CheckIn, now = new Date()): Promise<CheckInResult> {
  const habit = await Habit.findOne({ _id: id, userId, archived: false })
  if (!habit) throw new HabitError(404, 'Habit not found')
  const today = await todayFor(userId, now)
  const day = input.day ?? today
  if (!DAY_KEY.test(day)) throw new HabitError(400, 'Pick a day')
  if (day > today) throw new HabitError(400, 'You can’t log a day that hasn’t happened yet')
  if (day < addDays(today, -LOOKBACK_DAYS)) throw new HabitError(400, 'That day is too long ago to change')

  const existing = await HabitLog.findOne({ userId, habitId: habit._id, day })
  const previousValue = existing?.value ?? 0
  const raw = input.value !== undefined ? input.value : previousValue + (input.add ?? 0)
  if (!Number.isFinite(raw)) throw new HabitError(400, 'Enter a number')
  const value = Math.min(100000, Math.max(0, Math.round(raw)))

  if (value === 0) await HabitLog.deleteOne({ userId, habitId: habit._id, day })
  else await HabitLog.updateOne({ userId, habitId: habit._id, day }, { $set: { value } }, { upsert: true })

  const values = (await valuesFor(userId, [habit._id], addDays(today, -LOOKBACK_DAYS))).get(String(habit._id)) ?? new Map()
  const out = shape(habit as unknown as HabitDoc, values, today)
  const streak = out.streak.current

  // Celebrate each milestone once per run. Undoing and redoing a day stays the same run; a new run starts the count again.
  let lastMilestone = habit.lastMilestone ?? 0
  const runStart = out.streak.start
  if (runStart && habit.milestoneRunStart !== runStart) lastMilestone = 0
  const reached = milestoneFor(streak)
  let milestone: number | null = null
  if (reached > lastMilestone && value > previousValue) milestone = reached
  await Habit.updateOne({ _id: habit._id, userId }, { $set: {
    lastMilestone: milestone ?? lastMilestone,
    milestoneRunStart: runStart ?? habit.milestoneRunStart ?? null,
    bestStreak: Math.max(habit.bestStreak ?? 0, out.streak.best),
  } })

  if (milestone) {
    const notify = (await Settings.findOne({ userId }, { notifications: 1 }))?.get('notifications.habits.enabled') !== false
    if (notify) {
      void sendToUser(userId, {
        title: `${milestone}-day streak${habit.emoji ? ` ${habit.emoji}` : ''}`,
        body: `You've kept up “${habit.name}” for ${milestone} days in a row.`,
        url: '/habits', tag: `habit-${habit._id}-${milestone}`,
      }).catch(() => {})
    }
  }
  return { ...out, milestone, previousValue }
}

/** Habits expected today that are still not done (for the evening reminder and the assistant). */
export async function openToday(userId: string, now = new Date()) {
  const { habits } = await listHabits(userId, now)
  return habits.filter(h => h.today.scheduled && !h.today.done)
}
