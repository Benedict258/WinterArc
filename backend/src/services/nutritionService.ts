import { Meal } from '../models/Meal'
import { Settings } from '../models/Settings'
import { DEFAULT_TIMEZONE, toDayKey } from './dailyGenerationService'
import {
  averageLogged, loggingStreak, macroSplit, mealProblem, normalizeGoals, remaining, roundMacros, sumMacros, ZERO, type MealInput, type MealSlot,
} from '../../../src/shared/nutrition'

export class NutritionError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const MAX_MEALS_PER_DAY = 40
const MAX_BACK_DAYS = 400

const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

async function context(userId: string, now: Date) {
  const settings = await Settings.findOne({ userId }, { timezone: 1, nutrition: 1 })
  const goals = normalizeGoals((settings?.nutrition as any)?.toObject?.() ?? settings?.nutrition)
  return { goals, today: toDayKey(now, settings?.timezone || DEFAULT_TIMEZONE) }
}

export const mealJson = (m: any) => ({
  id: String(m._id), day: m.day, slot: m.slot as MealSlot, text: m.text, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG,
  items: (m.items ?? []).map((i: any) => ({ name: i.name, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG })), source: m.source,
})

function clean(input: unknown, today: string): MealInput {
  const problem = mealProblem(input)
  if (problem) throw new NutritionError(400, problem)
  const m = input as MealInput
  if (m.day > addDays(today, 1)) throw new NutritionError(400, 'That day hasn’t happened yet')
  if (m.day < addDays(today, -MAX_BACK_DAYS)) throw new NutritionError(400, 'That day is too long ago')
  return { ...m, text: m.text.trim(), ...roundMacros(m), items: m.items.map(i => ({ name: i.name.trim(), ...roundMacros(i) })) }
}

export async function createMeal(userId: string, input: unknown, source: 'manual' | 'estimate' | 'assistant' = 'manual', now = new Date()) {
  const { today } = await context(userId, now)
  const m = clean(input, today)
  if ((await Meal.countDocuments({ userId, day: m.day })) >= MAX_MEALS_PER_DAY) throw new NutritionError(409, 'That’s a lot of meals for one day. Edit or delete some first.')
  return mealJson(await Meal.create({ userId, ...m, source }))
}

export async function updateMeal(userId: string, id: string, input: unknown, now = new Date()) {
  const { today } = await context(userId, now)
  const m = clean(input, today)
  const doc = await Meal.findOneAndUpdate({ _id: id, userId }, { $set: m }, { new: true })
  if (!doc) throw new NutritionError(404, 'Meal not found')
  return mealJson(doc)
}

export async function deleteMeal(userId: string, id: string) {
  const doc = await Meal.findOneAndDelete({ _id: id, userId })
  if (!doc) throw new NutritionError(404, 'Meal not found')
  return { ok: true }
}

export async function overview(userId: string, days = 14, now = new Date()) {
  const span = Math.min(Math.max(Math.round(days) || 14, 7), 90)
  const { goals, today } = await context(userId, now)
  const since = addDays(today, -(span - 1))
  const [window, recentDocs, loggedDocs] = await Promise.all([
    Meal.find({ userId, day: { $gte: since } }).sort({ day: 1, createdAt: 1 }),
    Meal.find({ userId, day: { $gte: addDays(today, -60) } }).sort({ day: -1, createdAt: -1 }).limit(300),
    Meal.find({ userId, day: { $gte: addDays(today, -400) } }, { day: 1 }),
  ])
  const byDay = new Map<string, any[]>()
  for (const m of window) byDay.set(m.day, [...(byDay.get(m.day) ?? []), m])
  const daily = Array.from({ length: span }, (_, i) => {
    const day = addDays(since, i)
    const meals = byDay.get(day) ?? []
    return { day, meals: meals.length, ...roundMacros(meals.length ? sumMacros(meals) : ZERO) }
  })
  const todayMeals = (byDay.get(today) ?? []).map(mealJson)
  const eaten = roundMacros(sumMacros(todayMeals))
  // distinct recent meals by description, so a regular lunch is one tap away
  const seen = new Set<string>()
  const recent = []
  for (const m of recentDocs) {
    const k = m.text.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    recent.push(mealJson(m))
    if (recent.length >= 12) break
  }
  return {
    today, goals, todayMeals, eaten, remaining: remaining(goals, eaten), split: macroSplit(eaten),
    days: daily, average: averageLogged(daily.slice(-7)), average30: averageLogged(daily),
    streak: loggingStreak(new Set(loggedDocs.map(d => d.day)), today), recent,
  }
}
