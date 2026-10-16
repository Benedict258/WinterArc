// Routines: named, reusable lists of things to do in a day (a morning routine, a study day).
// Shared by the server (validation, adding them to a day) and the screens.

import type { Intensity } from './dayBlocks'

export const MAX_ROUTINES = 20
export const MAX_ROUTINE_ITEMS = 30

export type RoutineItem = {
  id: string
  title: string
  /** 'HH:mm' wall-clock start, or null for "sometime that day" */
  startTime: string | null
  minutes: number | null
  intensity: Intensity
}
export type RoutineInput = { name: string; /** 0 = Sunday … 6 = Saturday */ weekdays: number[]; autoAdd: boolean; items: RoutineItem[] }

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ITEM_ID = /^[a-z0-9]{1,16}$/

export function routineProblem(r: unknown): string | null {
  const x = r as Partial<RoutineInput> | null
  if (!x || typeof x !== 'object') return 'Routine is missing'
  if (typeof x.name !== 'string' || !x.name.trim() || x.name.trim().length > 60) return 'Give the routine a name (up to 60 characters)'
  if (!Array.isArray(x.weekdays) || x.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(x.weekdays).size !== x.weekdays.length) return 'Weekdays must be unique days from Sunday to Saturday'
  if (typeof x.autoAdd !== 'boolean') return 'Say whether it is added automatically'
  if (!Array.isArray(x.items) || x.items.length < 1 || x.items.length > MAX_ROUTINE_ITEMS) return `A routine needs 1 to ${MAX_ROUTINE_ITEMS} steps`
  const ids = new Set<string>()
  for (const i of x.items) {
    if (!i || typeof i.id !== 'string' || !ITEM_ID.test(i.id) || ids.has(i.id)) return 'Each step needs its own short id'
    ids.add(i.id)
    if (typeof i.title !== 'string' || !i.title.trim() || i.title.trim().length > 120) return 'Each step needs a title (up to 120 characters)'
    if (i.startTime !== null && !(typeof i.startTime === 'string' && TIME.test(i.startTime))) return 'Start times look like 07:30'
    if (i.minutes !== null && !(Number.isInteger(i.minutes) && i.minutes >= 1 && i.minutes <= 600)) return 'Minutes must be 1 to 600'
    if (!['light', 'medium', 'heavy'].includes(i.intensity)) return 'Pick light, medium or heavy for each step'
  }
  if (x.autoAdd && x.weekdays.length === 0) return 'Pick at least one weekday for a routine that is added automatically'
  return null
}

/** 0 = Sunday … 6 = Saturday for a 'YYYY-MM-DD' day (calendar arithmetic, no timezone involved). */
export const weekdayOfDayKey = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`).getUTCDay()

export const routineRunsOn = (r: Pick<RoutineInput, 'weekdays'>, dayKey: string) => r.weekdays.includes(weekdayOfDayKey(dayKey))

/** Marks a task as coming from this step of this routine, so adding the routine twice doesn't duplicate it. */
export const routineKey = (routineId: string, itemId: string) => `${routineId}:${itemId}`

/** 'HH:mm' + minutes → 'HH:mm' (clamped to the end of the day). */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function normalizeRoutine(r: RoutineInput): RoutineInput {
  return {
    name: r.name.trim(),
    weekdays: [...r.weekdays].sort((a, b) => a - b),
    autoAdd: r.autoAdd,
    items: r.items.map(i => ({ id: i.id, title: i.title.trim(), startTime: i.startTime, minutes: i.minutes, intensity: i.intensity })),
  }
}
