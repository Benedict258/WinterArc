import { addDaysKey, dayKeyToDate, toDayKey } from './dailyGenerationService'

/**
 * Calendar quarter containing `now` in the user's timezone. Tasks are stored
 * at UTC midnight of their day key, so the range is expressed the same way:
 * `start` is the first day, `end` the last instant of the last day.
 */
export function quarterRange(now: Date, timeZone: string) {
  const [year, month] = toDayKey(now, timeZone).split('-').map(Number)
  const quarter = Math.floor((month - 1) / 3)
  const startKey = `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`
  const nextKey = quarter === 3 ? `${year + 1}-01-01` : `${year}-${String((quarter + 1) * 3 + 1).padStart(2, '0')}-01`
  return {
    start: dayKeyToDate(startKey),
    end: new Date(dayKeyToDate(nextKey).getTime() - 1),
    label: `Q${quarter + 1}-${year}`,
  }
}

/** Consecutive days (in the user's timezone) with at least one completed task, ending today or yesterday. */
export function computeStreak(completedAts: (Date | null | undefined)[], timeZone: string, now = new Date()) {
  const days = new Set(completedAts.filter(Boolean).map(d => toDayKey(new Date(d!), timeZone)))
  let key = toDayKey(now, timeZone)
  // If today isn't done yet but yesterday was, the streak is still alive
  if (!days.has(key)) key = addDaysKey(key, -1)
  let streak = 0
  while (days.has(key)) {
    streak++
    key = addDaysKey(key, -1)
  }
  return streak
}

/** Completion over tasks that were actually in play — skipped tasks don't count against you. */
export function completionStats(tasks: { status: string }[]) {
  const counted = tasks.filter(t => t.status !== 'skipped')
  const completed = counted.filter(t => t.status === 'done').length
  const total = counted.length
  return { completed, total, rate: total > 0 ? Math.round((completed / total) * 100) : 0 }
}
