// Habits: what counts as done, streaks, completion rates and monthly averages.
// Pure functions over 'YYYY-MM-DD' day keys, shared by the server and the screens.

export const MAX_HABITS = 30
export const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365, 500, 730, 1000]
export const MAX_LOOKBACK_DAYS = 1100

export type HabitRule = {
  /** 0 = Sunday … 6 = Saturday; the days it is expected */
  weekdays: number[]
  /** how many counts make a day "done" (1 = a simple yes/no habit; 8 = eight glasses) */
  target: number
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const weekdayOf = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`).getUTCDay()

export function addDays(dayKey: string, n: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const isScheduled = (rule: Pick<HabitRule, 'weekdays'>, dayKey: string) => rule.weekdays.includes(weekdayOf(dayKey))
export const isDone = (rule: Pick<HabitRule, 'target'>, value: number | undefined) => (value ?? 0) >= rule.target

/** day → value for the days with a log */
export type Values = ReadonlyMap<string, number>

/**
 * Current and best run of days in a row. A day counts when its value reaches the target.
 * A scheduled day that is not done breaks the run, except today (it is still open).
 * Days the habit is not expected on neither break nor extend a run; doing it anyway extends it.
 */
export function streaks(rule: HabitRule, values: Values, today: string): { current: number; best: number; /** first day of the current run */ start: string | null } {
  let best = 0
  let run = 0
  const days = [...values.keys()].sort()
  if (days.length > 0) {
    let day = days[0]
    let guard = 0
    while (day <= today && guard++ < MAX_LOOKBACK_DAYS * 2) {
      if (isDone(rule, values.get(day))) { run += 1; best = Math.max(best, run) }
      else if (isScheduled(rule, day) && day !== today) run = 0
      day = addDays(day, 1)
    }
  }
  // current = the run that is still alive at the end of that scan
  let current = 0
  let start: string | null = null
  let day = today
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    if (isDone(rule, values.get(day))) { current += 1; start = day }
    else if (isScheduled(rule, day) && day !== today) break
    day = addDays(day, -1)
  }
  return { current, best: Math.max(best, current), start }
}

/** Highest milestone a streak has reached, or 0. */
export const milestoneFor = (streak: number) => [...MILESTONES].reverse().find(m => streak >= m) ?? 0

export type Period = { scheduled: number; done: number; rate: number; total: number; perDay: number }

/** How a habit did between two days (inclusive). `from` is clamped to when the habit started. */
export function periodStats(rule: HabitRule, values: Values, from: string, to: string, startedOn: string): Period {
  const first = from < startedOn ? startedOn : from
  let scheduled = 0
  let done = 0
  let total = 0
  let days = 0
  for (let day = first, guard = 0; day <= to && guard++ < 800; day = addDays(day, 1)) {
    days += 1
    const v = values.get(day) ?? 0
    total += v
    if (isScheduled(rule, day)) {
      scheduled += 1
      if (isDone(rule, v)) done += 1
    } else if (isDone(rule, v)) {
      // an unexpected day done is a bonus: it counts on both sides so it can't push the rate over 100%
      scheduled += 1; done += 1
    }
  }
  return { scheduled, done, rate: scheduled ? done / scheduled : 0, total, perDay: days ? total / days : 0 }
}

export const monthOf = (dayKey: string) => dayKey.slice(0, 7)

export function monthBounds(month: string, today: string): { from: string; to: string } {
  const from = `${month}-01`
  const next = new Date(`${from}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const last = addDays(next.toISOString().slice(0, 10), -1)
  return { from, to: last > today ? today : last }
}

export type MonthRow = { month: string } & Period

/** Newest first: this month so far, then the previous ones. */
export function monthlyStats(rule: HabitRule, values: Values, today: string, startedOn: string, months = 6): MonthRow[] {
  const rows: MonthRow[] = []
  let cursor = `${monthOf(today)}-01`
  for (let i = 0; i < months; i++) {
    const month = monthOf(cursor)
    const { from, to } = monthBounds(month, today)
    if (to < startedOn) break
    rows.push({ month, ...periodStats(rule, values, from, to, startedOn) })
    cursor = addDays(cursor, -1).slice(0, 7) + '-01'
  }
  return rows
}

export function habitProblem(h: unknown): string | null {
  const x = h as { name?: unknown; weekdays?: unknown; target?: unknown; unit?: unknown; emoji?: unknown } | null
  if (!x || typeof x !== 'object') return 'Habit is missing'
  if (typeof x.name !== 'string' || !x.name.trim() || x.name.trim().length > 60) return 'Give the habit a name (up to 60 characters)'
  if (!Array.isArray(x.weekdays) || x.weekdays.length === 0 || x.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(x.weekdays).size !== x.weekdays.length) return 'Pick at least one day of the week'
  if (!Number.isInteger(x.target) || (x.target as number) < 1 || (x.target as number) > 1000) return 'The daily target must be a whole number from 1 to 1000'
  if (x.unit !== undefined && x.unit !== null && (typeof x.unit !== 'string' || x.unit.length > 16)) return 'The unit can be up to 16 characters'
  if (x.emoji !== undefined && x.emoji !== null && (typeof x.emoji !== 'string' || [...x.emoji].length > 2)) return 'Use at most one emoji'
  return null
}
