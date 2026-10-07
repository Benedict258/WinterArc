import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { addDaysKey, dayKeyToDate, forecastWeek, weekStartKey } from './dailyGenerationService'

type GridBalancing = {
  maxDailyIntensity: number
  preferLowIntensityOnBusyDays: boolean
}

function defaultBalancing(): GridBalancing {
  return { maxDailyIntensity: 6, preferLowIntensityOnBusyDays: true }
}

/**
 * Committed tasks for the week containing `dayKey`, plus a read-only
 * forecast for the days that haven't been reached yet. Nothing is written —
 * days are committed one at a time by ensureTodayGenerated().
 */
export async function getWeek(dayKey: string) {
  const weekKey = weekStartKey(dayKey)
  const tasks = await Task.find({
    date: { $gte: dayKeyToDate(weekKey), $lt: dayKeyToDate(addDaysKey(weekKey, 7)) },
  }).sort({ date: 1, createdAt: 1 })
  const forecast = await forecastWeek(weekKey)
  return { weekStart: weekKey, tasks, forecast }
}

export async function getGridSettings() {
  const settings = await Settings.findOne()
  if (!settings) {
    return defaultBalancing()
  }
  return {
    maxDailyIntensity: settings.gridBalancing?.maxDailyIntensity ?? 6,
    preferLowIntensityOnBusyDays: settings.gridBalancing?.preferLowIntensityOnBusyDays ?? true,
  }
}

export async function updateGridSettings(updates: Partial<GridBalancing>) {
  let settings = await Settings.findOne()
  if (!settings) {
    settings = await Settings.create({
      timezone: 'Africa/Lagos',
      gridBalancing: { ...defaultBalancing(), ...updates },
    })
  } else {
    const current = settings.gridBalancing || defaultBalancing()
    settings.gridBalancing = { ...current, ...updates }
    await settings.save()
  }
  return {
    maxDailyIntensity: settings.gridBalancing?.maxDailyIntensity ?? 6,
    preferLowIntensityOnBusyDays: settings.gridBalancing?.preferLowIntensityOnBusyDays ?? true,
  }
}
