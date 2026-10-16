// Nutrition: meals, daily totals and goals. Pure helpers shared by the server and the screens.
// Numbers are estimates: people type them or an AI estimates them from a description.

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]
export const MAX_MEAL_ITEMS = 20

export type Macros = { calories: number; proteinG: number; carbsG: number; fatG: number }
export type MealItem = { name: string } & Macros
export type MealInput = { day: string; slot: MealSlot; text: string; items: MealItem[] } & Macros

export const GOAL_MODES = ['none', 'lose', 'maintain', 'gain'] as const
export type GoalMode = (typeof GOAL_MODES)[number]
export type NutritionGoals = { calories: number; proteinG: number; carbsG: number | null; fatG: number | null; mode: GoalMode; diet: string; avoid: string }

export const MIN_CALORIE_GOAL = 1000
export const MAX_CALORIE_GOAL = 6000
export const DEFAULT_NUTRITION_GOALS: NutritionGoals = { calories: 2200, proteinG: 100, carbsG: null, fatG: null, mode: 'none', diet: '', avoid: '' }

const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d }
const nullableInt = (v: unknown, min: number, max: number) => (v === null || v === undefined || v === '' ? null : clampInt(v, min, max, min))

export function normalizeGoals(raw: Partial<NutritionGoals> | null | undefined): NutritionGoals {
  return {
    calories: clampInt(raw?.calories, MIN_CALORIE_GOAL, MAX_CALORIE_GOAL, DEFAULT_NUTRITION_GOALS.calories),
    proteinG: clampInt(raw?.proteinG, 0, 500, DEFAULT_NUTRITION_GOALS.proteinG),
    carbsG: nullableInt(raw?.carbsG, 0, 1000),
    fatG: nullableInt(raw?.fatG, 0, 500),
    mode: GOAL_MODES.includes(raw?.mode as GoalMode) ? (raw!.mode as GoalMode) : 'none',
    diet: typeof raw?.diet === 'string' ? raw.diet.trim().slice(0, 80) : '',
    avoid: typeof raw?.avoid === 'string' ? raw.avoid.trim().slice(0, 200) : '',
  }
}

const inRange = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const MACRO_LIMITS: Record<keyof Macros, number> = { calories: 10_000, proteinG: 1000, carbsG: 2000, fatG: 1000 }

export function macrosProblem(m: Partial<Macros> | null | undefined): string | null {
  if (!m) return 'Numbers are missing'
  for (const k of Object.keys(MACRO_LIMITS) as (keyof Macros)[]) {
    if (!inRange(m[k], MACRO_LIMITS[k])) return `${k === 'calories' ? 'Calories' : k.replace('G', '')} must be 0 to ${MACRO_LIMITS[k].toLocaleString('en')}`
  }
  return null
}

export function mealProblem(m: unknown): string | null {
  const x = m as Partial<MealInput> | null
  if (!x || typeof x !== 'object') return 'Meal is missing'
  if (typeof x.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.day)) return 'Pick the day'
  if (!MEAL_SLOTS.includes(x.slot as MealSlot)) return 'Pick breakfast, lunch, dinner or snack'
  if (typeof x.text !== 'string' || !x.text.trim() || x.text.trim().length > 300) return 'Say what you ate (up to 300 characters)'
  const own = macrosProblem(x)
  if (own) return own
  if (!Array.isArray(x.items) || x.items.length > MAX_MEAL_ITEMS) return `Up to ${MAX_MEAL_ITEMS} items`
  for (const i of x.items) {
    if (!i || typeof i.name !== 'string' || !i.name.trim() || i.name.length > 80) return 'Each item needs a name'
    const p = macrosProblem(i)
    if (p) return p
  }
  return null
}

export const ZERO: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
export const addMacros = (a: Macros, b: Macros): Macros => ({ calories: a.calories + b.calories, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG })
export const sumMacros = (xs: Macros[]): Macros => xs.reduce(addMacros, ZERO)
export const roundMacros = (m: Macros): Macros => ({ calories: Math.round(m.calories), proteinG: Math.round(m.proteinG), carbsG: Math.round(m.carbsG), fatG: Math.round(m.fatG) })

/** Calories the macros add up to (4 per gram of protein and carbs, 9 per gram of fat). */
export const caloriesFromMacros = (m: Pick<Macros, 'proteinG' | 'carbsG' | 'fatG'>) => Math.round(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9)

export type Remaining = { calories: number; proteinG: number; carbsG: number | null; fatG: number | null }
export function remaining(goals: NutritionGoals, eaten: Macros): Remaining {
  return {
    calories: goals.calories - eaten.calories,
    proteinG: goals.proteinG - eaten.proteinG,
    carbsG: goals.carbsG === null ? null : goals.carbsG - eaten.carbsG,
    fatG: goals.fatG === null ? null : goals.fatG - eaten.fatG,
  }
}

/** Share of calories from each macro (null when nothing was eaten). */
export function macroSplit(m: Macros) {
  const total = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9
  if (total <= 0) return null
  return { protein: (m.proteinG * 4) / total, carbs: (m.carbsG * 4) / total, fat: (m.fatG * 9) / total }
}

export type DayTotal = Macros & { day: string; meals: number }

/** Days (newest last) with at least one meal logged, and their average. Days without meals aren't counted as zero: no log isn't no food. */
export function averageLogged(days: DayTotal[]): Macros & { daysLogged: number } {
  const logged = days.filter(d => d.meals > 0)
  if (logged.length === 0) return { ...ZERO, daysLogged: 0 }
  const s = sumMacros(logged)
  const n = logged.length
  return { calories: Math.round(s.calories / n), proteinG: Math.round(s.proteinG / n), carbsG: Math.round(s.carbsG / n), fatG: Math.round(s.fatG / n), daysLogged: n }
}

/** Days in a row (ending today or yesterday) with at least one meal logged. */
export function loggingStreak(loggedDays: Set<string>, today: string): number {
  const step = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
  let day = loggedDays.has(today) ? today : step(today, -1)
  let n = 0
  while (loggedDays.has(day) && n < 1000) { n++; day = step(day, -1) }
  return n
}

/** A calorie goal under this is flagged so the screens and the advisor treat it carefully. */
export const LOW_CALORIE_GOAL = 1400
