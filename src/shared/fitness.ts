// Fitness: workouts, steps and body measurements. Pure helpers shared by the server and the screens.
// Everything is stored in metric units (kg, km, cm); the screens convert for people who prefer imperial.

export type Units = 'metric' | 'imperial'
export const KG_PER_LB = 0.45359237
export const KM_PER_MI = 1.609344
export const kgToLb = (kg: number) => kg / KG_PER_LB
export const lbToKg = (lb: number) => lb * KG_PER_LB
export const kmToMi = (km: number) => km / KM_PER_MI
export const miToKm = (mi: number) => mi * KM_PER_MI
export const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places

export type FitnessPrefs = { stepGoal: number; weeklyWorkouts: number; units: Units }
export const DEFAULT_FITNESS_PREFS: FitnessPrefs = { stepGoal: 8000, weeklyWorkouts: 3, units: 'metric' }

export function normalizeFitnessPrefs(raw: Partial<FitnessPrefs> | null | undefined): FitnessPrefs {
  const int = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
  return {
    stepGoal: int(raw?.stepGoal, 500, 100_000, DEFAULT_FITNESS_PREFS.stepGoal),
    weeklyWorkouts: int(raw?.weeklyWorkouts, 1, 14, DEFAULT_FITNESS_PREFS.weeklyWorkouts),
    units: raw?.units === 'imperial' ? 'imperial' : 'metric',
  }
}

// ---------------------------------------------------------------- workouts

export const WORKOUT_KINDS = ['strength', 'cardio', 'sport', 'mobility', 'other'] as const
export type WorkoutKind = (typeof WORKOUT_KINDS)[number]
export const MAX_EXERCISES = 30
export const MAX_SETS = 20

export type SetEntry = { reps: number | null; weightKg: number | null; seconds: number | null; km: number | null }
export type Exercise = { name: string; sets: SetEntry[] }
export type WorkoutInput = {
  day: string; title: string; kind: WorkoutKind
  minutes: number | null; km: number | null; calories: number | null; effort: number | null
  notes: string; exercises: Exercise[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const numOrNull = (v: unknown, min: number, max: number) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max)

export function workoutProblem(w: unknown): string | null {
  const x = w as Partial<WorkoutInput> | null
  if (!x || typeof x !== 'object') return 'Workout is missing'
  if (typeof x.day !== 'string' || !DAY.test(x.day)) return 'Pick the day'
  if (typeof x.title !== 'string' || !x.title.trim() || x.title.trim().length > 80) return 'Give the workout a title (up to 80 characters)'
  if (!WORKOUT_KINDS.includes(x.kind as WorkoutKind)) return 'Pick a type'
  if (!numOrNull(x.minutes, 1, 1440)) return 'Minutes must be 1 to 1440'
  if (!numOrNull(x.km, 0, 1000)) return 'Distance must be 0 to 1000 km'
  if (!numOrNull(x.calories, 0, 20000)) return 'Calories must be 0 to 20000'
  if (!numOrNull(x.effort, 1, 10)) return 'Effort is 1 to 10'
  if (typeof x.notes !== 'string' || x.notes.length > 2000) return 'Notes can be up to 2000 characters'
  if (!Array.isArray(x.exercises) || x.exercises.length > MAX_EXERCISES) return `Up to ${MAX_EXERCISES} exercises`
  for (const e of x.exercises) {
    if (!e || typeof e.name !== 'string' || !e.name.trim() || e.name.trim().length > 60) return 'Each exercise needs a name (up to 60 characters)'
    if (!Array.isArray(e.sets) || e.sets.length > MAX_SETS) return `Up to ${MAX_SETS} sets per exercise`
    for (const s of e.sets) {
      if (!s || !numOrNull(s.reps, 0, 1000) || !numOrNull(s.weightKg, 0, 1000) || !numOrNull(s.seconds, 0, 86_400) || !numOrNull(s.km, 0, 1000)) return 'A set has a value out of range'
      if (s.reps === null && s.weightKg === null && s.seconds === null && s.km === null) return 'A set needs at least one number'
    }
  }
  if (x.kind === 'strength' && x.exercises.length === 0 && x.minutes === null) return 'Add an exercise or the minutes'
  return null
}

/** Total weight moved: sum of reps x weight over every set that has both. */
export const workoutVolumeKg = (w: Pick<WorkoutInput, 'exercises'>) =>
  w.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + (s.reps && s.weightKg ? s.reps * s.weightKg : 0), 0), 0)

/** Epley estimate of the heaviest single rep from a set (null when it can't be worked out). */
export const estimatedOneRepMax = (s: Pick<SetEntry, 'reps' | 'weightKg'>) =>
  s.reps && s.weightKg && s.reps <= 12 ? s.weightKg * (1 + s.reps / 30) : null

export type Best = { exercise: string; weightKg: number; reps: number; oneRepMax: number | null; day: string }

/** Heaviest set per exercise across all workouts (ties go to the most recent). */
export function personalBests(workouts: Pick<WorkoutInput, 'day' | 'exercises'>[]): Best[] {
  const best = new Map<string, Best>()
  for (const w of [...workouts].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (!s.weightKg || !s.reps) continue
        const key = e.name.trim().toLowerCase()
        const cur = best.get(key)
        if (!cur || s.weightKg >= cur.weightKg) best.set(key, { exercise: e.name.trim(), weightKg: s.weightKg, reps: s.reps, oneRepMax: estimatedOneRepMax(s), day: w.day })
      }
    }
  }
  return [...best.values()].sort((a, b) => a.exercise.localeCompare(b.exercise))
}

export function weekStart(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
export function addDays(dayKey: string, n: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Workouts, minutes and distance in the Monday-to-Sunday week containing `dayKey`. */
export function weekSummary(workouts: Pick<WorkoutInput, 'day' | 'minutes' | 'km'>[], dayKey: string) {
  const start = weekStart(dayKey)
  const end = addDays(start, 6)
  const inWeek = workouts.filter(w => w.day >= start && w.day <= end)
  return { start, count: inWeek.length, minutes: inWeek.reduce((n, w) => n + (w.minutes ?? 0), 0), km: round(inWeek.reduce((n, w) => n + (w.km ?? 0), 0)) }
}

// ------------------------------------------------------------------- steps

export const MAX_STEPS_PER_DAY = 150_000

export type StepEntry = { day: string; steps: number }

export function stepStats(entries: StepEntry[], goal: number, today: string) {
  const byDay = new Map(entries.map(e => [e.day, e.steps]))
  const window = (n: number) => Array.from({ length: n }, (_, i) => byDay.get(addDays(today, -i)) ?? 0)
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  // Days in a row meeting the goal; today still counts as open until it is met
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const v = byDay.get(addDays(today, -i)) ?? 0
    if (v >= goal) streak++
    else if (i === 0) continue
    else break
  }
  const best = entries.reduce<StepEntry | null>((b, e) => (!b || e.steps > b.steps ? e : b), null)
  return { avg7: avg(window(7)), avg30: avg(window(30)), goalDays7: window(7).filter(v => v >= goal).length, streak, best }
}

// ----------------------------------------------------------- body metrics

export type Metric = { day: string; weightKg: number | null; sleepHours: number | null; restingHr: number | null; waistCm: number | null; mood: number | null }
export const METRIC_FIELDS = ['weightKg', 'sleepHours', 'restingHr', 'waistCm', 'mood'] as const

export function metricProblem(m: unknown): string | null {
  const x = m as Partial<Metric> | null
  if (!x || typeof x !== 'object') return 'Measurement is missing'
  if (!numOrNull(x.weightKg, 20, 500)) return 'Weight must be 20 to 500 kg'
  if (!numOrNull(x.sleepHours, 0, 24)) return 'Sleep must be 0 to 24 hours'
  if (!numOrNull(x.restingHr, 25, 220)) return 'Resting heart rate must be 25 to 220'
  if (!numOrNull(x.waistCm, 30, 300)) return 'Waist must be 30 to 300 cm'
  if (!(x.mood === null || x.mood === undefined || (Number.isInteger(x.mood) && x.mood >= 1 && x.mood <= 5))) return 'Mood is 1 to 5'
  if (METRIC_FIELDS.every(f => x[f] === null || x[f] === undefined)) return 'Enter at least one value'
  return null
}

/** Moving average over the last `window` readings that fall in the last `window` days; smooths day-to-day noise in weight. */
export function movingAverage(points: { day: string; value: number }[], window = 7): { day: string; value: number }[] {
  const sorted = [...points].sort((a, b) => (a.day < b.day ? -1 : 1))
  return sorted.map(p => {
    const from = addDays(p.day, -(window - 1))
    const inWin = sorted.filter(q => q.day >= from && q.day <= p.day)
    return { day: p.day, value: round(inWin.reduce((n, q) => n + q.value, 0) / inWin.length, 2) }
  })
}

/** Change between the first and last reading in the last `days` days (null with fewer than two readings). */
export function changeOver(points: { day: string; value: number }[], days: number, today: string) {
  const from = addDays(today, -days)
  const win = points.filter(p => p.day >= from && p.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1))
  if (win.length < 2) return null
  return round(win[win.length - 1].value - win[0].value, 2)
}
