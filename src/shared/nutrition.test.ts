import { describe, it, expect } from 'vitest'
import {
  normalizeGoals, macrosProblem, mealProblem, sumMacros, caloriesFromMacros, remaining, macroSplit, averageLogged, loggingStreak, roundMacros, type MealInput,
} from './nutrition'

const meal = (over: Partial<MealInput> = {}): MealInput => ({
  day: '2026-10-12', slot: 'lunch', text: 'Rice, chicken and salad', calories: 650, proteinG: 45, carbsG: 70, fatG: 18,
  items: [{ name: 'Rice', calories: 300, proteinG: 6, carbsG: 65, fatG: 1 }, { name: 'Chicken', calories: 350, proteinG: 39, carbsG: 5, fatG: 17 }], ...over,
})

describe('goals', () => {
  it('has sensible defaults and clamps', () => {
    expect(normalizeGoals(undefined)).toMatchObject({ calories: 2200, proteinG: 100, carbsG: null, fatG: null, mode: 'none' })
    expect(normalizeGoals({ calories: 200, proteinG: 9999, carbsG: -5, fatG: 70, mode: 'bulk' as any, diet: ' vegetarian ', avoid: 'x'.repeat(500) })).toMatchObject({
      calories: 1000, proteinG: 500, carbsG: 0, fatG: 70, mode: 'none', diet: 'vegetarian',
    })
    expect(normalizeGoals({ calories: 9000 }).calories).toBe(6000)
    expect(normalizeGoals({ avoid: 'x'.repeat(500) }).avoid).toHaveLength(200)
  })
})

describe('meals', () => {
  it('accepts a good meal', () => expect(mealProblem(meal())).toBeNull())
  it.each([
    ['bad day', { day: 'today' }], ['bad slot', { slot: 'brunch' as any }], ['no text', { text: '  ' }], ['negative calories', { calories: -1 }],
    ['absurd calories', { calories: 50_000 }], ['NaN protein', { proteinG: NaN }], ['too many items', { items: Array.from({ length: 21 }, () => ({ name: 'x', calories: 1, proteinG: 0, carbsG: 0, fatG: 0 })) }],
    ['unnamed item', { items: [{ name: '', calories: 1, proteinG: 0, carbsG: 0, fatG: 0 }] }],
  ])('rejects %s', (_n, over) => expect(mealProblem(meal(over as any))).not.toBeNull())
  it('checks macro fields', () => {
    expect(macrosProblem({ calories: 10, proteinG: 1, carbsG: 1, fatG: 1 })).toBeNull()
    expect(macrosProblem({ calories: 10, proteinG: 1, carbsG: 1 } as any)).not.toBeNull()
  })
})

describe('totals', () => {
  it('sums, rounds and derives calories from macros', () => {
    expect(sumMacros(meal().items)).toEqual({ calories: 650, proteinG: 45, carbsG: 70, fatG: 18 })
    expect(roundMacros({ calories: 10.6, proteinG: 1.4, carbsG: 2.5, fatG: 0.4 })).toEqual({ calories: 11, proteinG: 1, carbsG: 3, fatG: 0 })
    expect(caloriesFromMacros({ proteinG: 30, carbsG: 50, fatG: 10 })).toBe(410)
  })
  it('reports what is left against the goals', () => {
    const goals = normalizeGoals({ calories: 2000, proteinG: 120, carbsG: 200 })
    expect(remaining(goals, { calories: 1500, proteinG: 130, carbsG: 150, fatG: 40 })).toEqual({ calories: 500, proteinG: -10, carbsG: 50, fatG: null })
  })
  it('macro split is by calories, and null with nothing eaten', () => {
    const s = macroSplit({ calories: 0, proteinG: 25, carbsG: 25, fatG: 0 })!
    expect(s.protein).toBeCloseTo(0.5); expect(s.fat).toBe(0)
    expect(macroSplit({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toBeNull()
  })
  it('averages only the days that have meals', () => {
    const d = (day: string, calories: number, meals: number) => ({ day, calories, proteinG: 50, carbsG: 100, fatG: 30, meals })
    expect(averageLogged([d('a', 2000, 3), d('b', 0, 0), d('c', 1800, 2)])).toEqual({ calories: 1900, proteinG: 50, carbsG: 100, fatG: 30, daysLogged: 2 })
    expect(averageLogged([]).daysLogged).toBe(0)
  })
  it('logging streak ends today or yesterday', () => {
    expect(loggingStreak(new Set(['2026-10-14', '2026-10-15', '2026-10-16']), '2026-10-16')).toBe(3)
    expect(loggingStreak(new Set(['2026-10-14', '2026-10-15']), '2026-10-16')).toBe(2)
    expect(loggingStreak(new Set(['2026-10-13']), '2026-10-16')).toBe(0)
  })
})
