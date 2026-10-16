import { describe, it, expect } from 'vitest'
import {
  normalizeFitnessPrefs, workoutProblem, workoutVolumeKg, estimatedOneRepMax, personalBests, weekSummary, stepStats, metricProblem,
  movingAverage, changeOver, kgToLb, lbToKg, kmToMi, miToKm, addDays, type WorkoutInput,
} from './fitness'

const set = (reps: number | null, weightKg: number | null) => ({ reps, weightKg, seconds: null, km: null })
const workout = (over: Partial<WorkoutInput> = {}): WorkoutInput => ({
  day: '2026-10-12', title: 'Push day', kind: 'strength', minutes: 50, km: null, calories: null, effort: 7, notes: '',
  exercises: [{ name: 'Bench press', sets: [set(8, 60), set(6, 70)] }], ...over,
})

describe('prefs and units', () => {
  it('clamps preferences', () => {
    expect(normalizeFitnessPrefs(undefined)).toEqual({ stepGoal: 8000, weeklyWorkouts: 3, units: 'metric' })
    expect(normalizeFitnessPrefs({ stepGoal: 5, weeklyWorkouts: 99, units: 'x' as any })).toEqual({ stepGoal: 500, weeklyWorkouts: 14, units: 'metric' })
    expect(normalizeFitnessPrefs({ units: 'imperial' }).units).toBe('imperial')
  })
  it('converts both ways', () => {
    expect(lbToKg(kgToLb(72.5))).toBeCloseTo(72.5)
    expect(miToKm(kmToMi(10))).toBeCloseTo(10)
    expect(kgToLb(100)).toBeCloseTo(220.46, 1)
  })
})

describe('workouts', () => {
  it('accepts a good workout', () => expect(workoutProblem(workout())).toBeNull())
  it.each([
    ['bad day', { day: 'today' }], ['no title', { title: ' ' }], ['bad kind', { kind: 'yoga' as any }], ['zero minutes', { minutes: 0 }],
    ['negative km', { km: -1 }], ['effort 11', { effort: 11 }], ['too many exercises', { exercises: Array.from({ length: 31 }, () => ({ name: 'x', sets: [set(1, 1)] })) }],
    ['empty set', { exercises: [{ name: 'x', sets: [{ reps: null, weightKg: null, seconds: null, km: null }] }] }],
    ['unnamed exercise', { exercises: [{ name: '', sets: [set(1, 1)] }] }],
    ['strength with nothing', { exercises: [], minutes: null }],
  ])('rejects %s', (_n, over) => expect(workoutProblem(workout(over as any))).not.toBeNull())
  it('a cardio session needs no exercises', () => expect(workoutProblem(workout({ kind: 'cardio', exercises: [], km: 5, minutes: 30 }))).toBeNull())

  it('volume and estimated one-rep max', () => {
    expect(workoutVolumeKg(workout())).toBe(8 * 60 + 6 * 70)
    expect(estimatedOneRepMax({ reps: 5, weightKg: 100 })).toBeCloseTo(116.67, 1)
    expect(estimatedOneRepMax({ reps: 20, weightKg: 40 })).toBeNull() // too many reps to estimate
    expect(estimatedOneRepMax({ reps: null, weightKg: 40 })).toBeNull()
  })
  it('personal bests are the heaviest set per exercise, latest on ties', () => {
    const bests = personalBests([workout({ day: '2026-10-01' }), workout({ day: '2026-10-08', exercises: [{ name: 'bench press', sets: [set(5, 70)] }, { name: 'Squat', sets: [set(5, 100)] }] })])
    expect(bests.map(b => [b.exercise, b.weightKg, b.day])).toEqual([['bench press', 70, '2026-10-08'], ['Squat', 100, '2026-10-08']])
  })
  it('week summary runs Monday to Sunday', () => {
    const ws = [{ day: '2026-10-11', minutes: 30, km: 3 }, { day: '2026-10-12', minutes: 45, km: null }, { day: '2026-10-18', minutes: 20, km: 2.5 }, { day: '2026-10-19', minutes: 99, km: 9 }]
    expect(weekSummary(ws, '2026-10-14')).toEqual({ start: '2026-10-12', count: 2, minutes: 65, km: 2.5 })
  })
})

describe('steps', () => {
  const today = '2026-10-16'
  const entries = (n: number, steps: number) => Array.from({ length: n }, (_, i) => ({ day: addDays(today, -i), steps }))
  it('averages, counts goal days and finds the best day', () => {
    const s = stepStats([...entries(7, 9000), { day: addDays(today, -10), steps: 20000 }], 8000, today)
    expect(s.avg7).toBe(9000)
    expect(s.goalDays7).toBe(7)
    expect(s.best).toEqual({ day: addDays(today, -10), steps: 20000 })
  })
  it('today not yet at goal does not break the streak, a missed earlier day does', () => {
    const e = entries(6, 9000).slice(1) // yesterday back 5 days
    expect(stepStats(e, 8000, today).streak).toBe(5)
    expect(stepStats([{ day: today, steps: 100 }, { day: addDays(today, -2), steps: 9000 }], 8000, today).streak).toBe(0)
  })
})

describe('body metrics', () => {
  it('validates ranges and needs a value', () => {
    const m = { day: '2026-10-12', weightKg: 72, sleepHours: 7.5, restingHr: 58, waistCm: null, mood: 4 }
    expect(metricProblem(m)).toBeNull()
    expect(metricProblem({ ...m, weightKg: 5 })).not.toBeNull()
    expect(metricProblem({ ...m, sleepHours: 25 })).not.toBeNull()
    expect(metricProblem({ ...m, mood: 6 })).not.toBeNull()
    expect(metricProblem({ day: 'x', weightKg: null, sleepHours: null, restingHr: null, waistCm: null, mood: null })).not.toBeNull()
  })
  it('moving average smooths and change reports first-to-last', () => {
    const pts = [{ day: '2026-10-10', value: 80 }, { day: '2026-10-11', value: 78 }, { day: '2026-10-12', value: 79 }]
    expect(movingAverage(pts, 3).map(p => p.value)).toEqual([80, 79, 79])
    expect(changeOver(pts, 30, '2026-10-16')).toBe(-1)
    expect(changeOver([pts[0]], 30, '2026-10-16')).toBeNull()
  })
})
