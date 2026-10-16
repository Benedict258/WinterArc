import { Workout } from '../models/Workout'
import { StepDay } from '../models/StepDay'
import { BodyMetric } from '../models/BodyMetric'
import { Settings } from '../models/Settings'
import { DEFAULT_TIMEZONE, toDayKey } from './dailyGenerationService'
import {
  MAX_STEPS_PER_DAY, METRIC_FIELDS, addDays, changeOver, metricProblem, movingAverage, normalizeFitnessPrefs, personalBests, stepStats, weekStart, weekSummary, workoutProblem,
  type Metric, type WorkoutInput,
} from '../../../src/shared/fitness'

export class FitnessError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const MAX_WORKOUTS = 20_000
const MAX_BACKFILL_DAYS = 800

async function context(userId: string, now: Date) {
  const settings = await Settings.findOne({ userId }, { timezone: 1, fitness: 1 })
  const prefs = normalizeFitnessPrefs((settings?.fitness as any)?.toObject?.() ?? settings?.fitness)
  return { prefs, today: toDayKey(now, settings?.timezone || DEFAULT_TIMEZONE) }
}

function checkDay(day: unknown, today: string, back = MAX_BACKFILL_DAYS): string {
  if (typeof day !== 'string' || !DAY_KEY.test(day)) throw new FitnessError(400, 'Pick a day')
  if (day > addDays(today, 1)) throw new FitnessError(400, 'That day hasn’t happened yet')
  if (day < addDays(today, -back)) throw new FitnessError(400, 'That day is too long ago')
  return day
}

// ---------------------------------------------------------------- workouts

const workoutJson = (w: any) => ({
  id: String(w._id), day: w.day, title: w.title, kind: w.kind, minutes: w.minutes ?? null, km: w.km ?? null, calories: w.calories ?? null, effort: w.effort ?? null,
  notes: w.notes ?? '', exercises: (w.exercises ?? []).map((e: any) => ({ name: e.name, sets: e.sets.map((s: any) => ({ reps: s.reps ?? null, weightKg: s.weightKg ?? null, seconds: s.seconds ?? null, km: s.km ?? null })) })),
  source: w.source,
})

function cleanWorkout(input: unknown, today: string): WorkoutInput {
  const problem = workoutProblem(input)
  if (problem) throw new FitnessError(400, problem)
  const w = input as WorkoutInput
  checkDay(w.day, today)
  return { ...w, title: w.title.trim(), notes: w.notes.trim(), exercises: w.exercises.map(e => ({ name: e.name.trim(), sets: e.sets })) }
}

export async function createWorkout(userId: string, input: unknown, source: 'manual' | 'assistant' = 'manual', now = new Date()) {
  const { today } = await context(userId, now)
  const clean = cleanWorkout(input, today)
  if ((await Workout.countDocuments({ userId })) >= MAX_WORKOUTS) throw new FitnessError(409, 'You’ve reached the workout limit. Delete some old ones first.')
  return workoutJson(await Workout.create({ userId, ...clean, source }))
}

export async function updateWorkout(userId: string, id: string, input: unknown, now = new Date()) {
  const { today } = await context(userId, now)
  const clean = cleanWorkout(input, today)
  const doc = await Workout.findOneAndUpdate({ _id: id, userId }, { $set: clean }, { new: true })
  if (!doc) throw new FitnessError(404, 'Workout not found')
  return workoutJson(doc)
}

export async function deleteWorkout(userId: string, id: string) {
  const doc = await Workout.findOneAndDelete({ _id: id, userId })
  if (!doc) throw new FitnessError(404, 'Workout not found')
  return { ok: true }
}

export async function listWorkouts(userId: string, limit = 50, before?: string) {
  const q: Record<string, unknown> = { userId }
  if (before && DAY_KEY.test(before)) q.day = { $lt: before }
  const docs = await Workout.find(q).sort({ day: -1, createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 200))
  return docs.map(workoutJson)
}

// ------------------------------------------------------------------- steps

export async function setManualSteps(userId: string, day: unknown, steps: unknown, now = new Date()) {
  const { today } = await context(userId, now)
  const d = checkDay(day, today)
  if (typeof steps !== 'number' || !Number.isFinite(steps) || steps < 0 || steps > MAX_STEPS_PER_DAY) throw new FitnessError(400, `Steps must be 0 to ${MAX_STEPS_PER_DAY.toLocaleString('en')}`)
  const value = Math.round(steps)
  await StepDay.updateOne({ userId, day: d }, { $set: { manual: value === 0 ? null : value } }, { upsert: true })
  const doc = await StepDay.findOne({ userId, day: d })
  // `steps` is what counts (the device count wins); `manual` is what was typed
  return { day: d, steps: doc?.synced ?? doc?.manual ?? 0, manual: doc?.manual ?? null, device: doc?.synced ?? null }
}

export type SyncInput = { steps?: { day: string; steps: number }[]; metrics?: { day: string; weightKg?: number | null; restingHr?: number | null; sleepHours?: number | null }[] }

/** A phone or watch reporting what it counted. Device values replace earlier device values; typed values are kept. */
export async function syncFromDevice(userId: string, input: SyncInput, now = new Date()) {
  const { today } = await context(userId, now)
  let steps = 0
  let metrics = 0
  for (const s of (input.steps ?? []).slice(0, 62)) {
    const day = checkDay(s.day, today, 100)
    if (typeof s.steps !== 'number' || !Number.isFinite(s.steps) || s.steps < 0 || s.steps > MAX_STEPS_PER_DAY) continue
    await StepDay.updateOne({ userId, day }, { $set: { synced: Math.round(s.steps) } }, { upsert: true })
    steps++
  }
  for (const m of (input.metrics ?? []).slice(0, 62)) {
    const day = checkDay(m.day, today, 100)
    const existing = await BodyMetric.findOne({ userId, day })
    const set: Record<string, unknown> = {}
    const synced = new Set<string>(existing?.syncedFields ?? [])
    for (const f of ['weightKg', 'restingHr', 'sleepHours'] as const) {
      const v = m[f]
      if (v === null || v === undefined) continue
      const candidate: Partial<Metric> = { [f]: Math.round(v * 10) / 10 }
      if (metricProblem({ day, weightKg: null, sleepHours: null, restingHr: null, waistCm: null, mood: null, ...candidate })) continue
      // never overwrite something the person typed
      if (existing && existing[f] != null && !synced.has(f)) continue
      set[f] = candidate[f]; synced.add(f)
    }
    if (Object.keys(set).length === 0) continue
    await BodyMetric.updateOne({ userId, day }, { $set: { ...set, syncedFields: [...synced] } }, { upsert: true })
    metrics++
  }
  return { steps, metrics }
}

// ---------------------------------------------------------------- metrics

const metricJson = (m: any) => ({ day: m.day, weightKg: m.weightKg ?? null, sleepHours: m.sleepHours ?? null, restingHr: m.restingHr ?? null, waistCm: m.waistCm ?? null, mood: m.mood ?? null, syncedFields: m.syncedFields ?? [] })

export async function saveMetric(userId: string, day: unknown, input: Partial<Metric>, now = new Date()) {
  const { today } = await context(userId, now)
  const d = checkDay(day, today)
  const full = { day: d, weightKg: null, sleepHours: null, restingHr: null, waistCm: null, mood: null, ...input }
  const problem = metricProblem(full)
  if (problem) throw new FitnessError(400, problem)
  const set: Record<string, unknown> = {}
  const synced = new Set<string>((await BodyMetric.findOne({ userId, day: d }))?.syncedFields ?? [])
  for (const f of METRIC_FIELDS) if (f in input) { set[f] = full[f] ?? null; synced.delete(f) } // typing a value takes ownership of it
  await BodyMetric.updateOne({ userId, day: d }, { $set: { ...set, syncedFields: [...synced] } }, { upsert: true })
  return metricJson(await BodyMetric.findOne({ userId, day: d }))
}

export async function deleteMetric(userId: string, day: unknown) {
  if (typeof day !== 'string' || !DAY_KEY.test(day)) throw new FitnessError(400, 'Pick a day')
  await BodyMetric.deleteOne({ userId, day })
  return { ok: true }
}

// --------------------------------------------------------------- overview

export async function overview(userId: string, days = 30, now = new Date()) {
  const span = Math.min(Math.max(Math.round(days) || 30, 7), 180)
  const { prefs, today } = await context(userId, now)
  const since = addDays(today, -(span - 1))
  const [stepDocs, metricDocs, recent, forWeeks, forBests] = await Promise.all([
    StepDay.find({ userId, day: { $gte: addDays(today, -400) } }),
    BodyMetric.find({ userId, day: { $gte: since } }).sort({ day: 1 }),
    Workout.find({ userId }).sort({ day: -1, createdAt: -1 }).limit(30),
    Workout.find({ userId, day: { $gte: addDays(weekStart(today), -7 * 11) } }, { day: 1, minutes: 1, km: 1 }),
    Workout.find({ userId, 'exercises.0': { $exists: true } }, { day: 1, exercises: 1 }).sort({ day: -1 }).limit(500),
  ])
  const all = stepDocs.map(d => ({ day: d.day, steps: d.synced ?? d.manual ?? 0, source: d.synced != null ? 'device' : 'manual' as const }))
  const stepsByDay = new Map(all.map(e => [e.day, e]))
  const steps = Array.from({ length: span }, (_, i) => {
    const day = addDays(today, i - (span - 1))
    return { day, steps: stepsByDay.get(day)?.steps ?? 0, source: stepsByDay.get(day)?.source ?? null }
  })
  const weights = metricDocs.filter(m => m.weightKg != null).map(m => ({ day: m.day, value: m.weightKg as number }))
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(weekStart(today), -7 * (11 - i))
    const s = weekSummary(forWeeks.map(w => ({ day: w.day, minutes: w.minutes ?? null, km: w.km ?? null })), start)
    return { start, count: s.count, minutes: s.minutes }
  })
  return {
    today, prefs,
    steps, stepStats: stepStats(all, prefs.stepGoal, today),
    todaySteps: stepsByDay.get(today)?.steps ?? 0,
    workouts: recent.map(workoutJson),
    week: { ...weekSummary(forWeeks.map(w => ({ day: w.day, minutes: w.minutes ?? null, km: w.km ?? null })), today), goal: prefs.weeklyWorkouts },
    weeks,
    bests: personalBests(forBests.map(w => ({ day: w.day, exercises: w.exercises.map((e: any) => ({ name: e.name, sets: e.sets })) }))).slice(0, 40),
    metrics: metricDocs.map(metricJson),
    weightTrend: movingAverage(weights, 7),
    weightChange30: changeOver(weights, 30, today),
  }
}
