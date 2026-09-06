import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import mongoose from 'mongoose'
import { addDays } from 'date-fns'

const INTENSITY_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 4 }
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }
const TIME_BLOCKS = ['morning', 'afternoon', 'evening'] as const

type ThreadShape = {
  _id: string
  name: string
  frequency: 'daily' | 'multiple' | 'weekly' | 'fixed-day'
  fixedDay?: number | null
  status: 'active' | 'parked' | 'archived' | string
  priority?: 'low' | 'medium' | 'high' | string
  intensity?: 'light' | 'medium' | 'heavy' | string
}

type GridBalancing = {
  maxDailyIntensity: number
  preferLowIntensityOnBusyDays: boolean
}

function defaultBalancing(): GridBalancing {
  return { maxDailyIntensity: 6, preferLowIntensityOnBusyDays: true }
}

async function loadBalancing(): Promise<GridBalancing> {
  try {
    const settings = await Settings.findOne()
    if (settings?.gridBalancing) {
      return {
        maxDailyIntensity: settings.gridBalancing.maxDailyIntensity ?? 6,
        preferLowIntensityOnBusyDays: settings.gridBalancing.preferLowIntensityOnBusyDays ?? true,
      }
    }
  } catch {
  }
  return defaultBalancing()
}

function expandSlots(threads: ThreadShape[]) {
  const slots: { thread: ThreadShape; fixedDay: number | null }[] = []
  for (const t of threads) {
    if (t.frequency === 'daily') {
      for (let i = 0; i < 7; i++) slots.push({ thread: t, fixedDay: i })
    } else if (t.frequency === 'multiple') {
      const pattern = [0, 2, 4]
      for (const dayIndex of pattern) slots.push({ thread: t, fixedDay: dayIndex })
    } else if (t.frequency === 'weekly') {
      slots.push({ thread: t, fixedDay: null })
    } else if (t.frequency === 'fixed-day') {
      const d = typeof t.fixedDay === 'number' ? t.fixedDay : 0
      slots.push({ thread: t, fixedDay: d })
    }
  }
  return slots
}

function sortSlots(slots: { thread: ThreadShape; fixedDay: number | null }[]) {
  return [...slots].sort((a, b) => {
    const pri = (PRIORITY_RANK[b.thread.priority || 'medium'] || 2) - (PRIORITY_RANK[a.thread.priority || 'medium'] || 2)
    if (pri !== 0) return pri
    const ia = INTENSITY_WEIGHT[a.thread.intensity || 'medium'] || 2
    const ib = INTENSITY_WEIGHT[b.thread.intensity || 'medium'] || 2
    return ib - ia
  })
}

function makeTask(thread: ThreadShape, date: Date, timeBlock: string) {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: thread.name,
    threadId: thread._id,
    date,
    timeBlock,
    source: 'auto-generated' as const,
    status: 'pending' as const,
    priority: thread.priority || 'medium',
    intensity: thread.intensity || 'medium',
  }
}

function pickBlock(blockLoads: Record<string, number>) {
  const blocks = [...TIME_BLOCKS]
  blocks.sort((a, b) => blockLoads[a] - blockLoads[b])
  return blocks[0]
}

export async function generateWeek(
  startDate: Date,
  threads: ThreadShape[],
  _existingTasks: unknown,
  balancingOverride?: GridBalancing
) {
  const balancing = balancingOverride || defaultBalancing()
  const active = threads.filter(t => t.status === 'active')

  const dayLoads: Record<number, number> = {}
  for (let i = 0; i < 7; i++) dayLoads[i] = 0
  const dayThreads: Record<number, Set<string>> = {}
  for (let i = 0; i < 7; i++) dayThreads[i] = new Set<string>()
  const dayBlockLoads: Record<number, Record<string, number>> = {}
  for (let i = 0; i < 7; i++) {
    dayBlockLoads[i] = { morning: 0, afternoon: 0, evening: 0 }
  }

  const tasks: any[] = []
  const slots = sortSlots(expandSlots(active))

  for (const slot of slots) {
    const intensity = INTENSITY_WEIGHT[slot.thread.intensity || 'medium'] || 2
    const threadId = String(slot.thread._id)

    const fixedDayIdx = slot.fixedDay
    const allowedDays: number[] = []
    for (let i = 0; i < 7; i++) {
      if (dayThreads[i].has(threadId)) continue
      if (fixedDayIdx !== null && i !== fixedDayIdx) continue
      allowedDays.push(i)
    }

    const candidatePool = allowedDays.length > 0 ? allowedDays : (() => {
      const fallback: number[] = []
      for (let i = 0; i < 7; i++) {
        if (fixedDayIdx !== null && i !== fixedDayIdx) continue
        fallback.push(i)
      }
      return fallback.length > 0 ? fallback : [0, 1, 2, 3, 4, 5, 6]
    })()

    const sortedDays = [...candidatePool].sort((a, b) => {
      const aFit = dayLoads[a] + intensity <= balancing.maxDailyIntensity ? 0 : 1
      const bFit = dayLoads[b] + intensity <= balancing.maxDailyIntensity ? 0 : 1
      if (aFit !== bFit) return aFit - bFit
      return dayLoads[a] - dayLoads[b]
    })
    const chosenDay = sortedDays[0]

    if (allowedDays.length > 0) {
      dayLoads[chosenDay] += intensity
      dayThreads[chosenDay].add(threadId)
    }

    const blockLoads = dayBlockLoads[chosenDay]
    const timeBlock = pickBlock(blockLoads)
    blockLoads[timeBlock] += 1

    tasks.push(makeTask(slot.thread, addDays(startDate, chosenDay), timeBlock))
  }

  return tasks
}

export async function getWeek(startDate: Date) {
  const weekStart = new Date(startDate)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = addDays(weekStart, 7)

  const threads = await Thread.find()
  let existingTasks = await Task.find({
    date: { $gte: weekStart, $lt: weekEnd },
  })

  const hasAutoGenerated = existingTasks.some(t => t.source === 'auto-generated')
  if (!hasAutoGenerated && threads.length > 0) {
    const balancing = await loadBalancing()
    const generatedTasks = await generateWeek(weekStart, threads, existingTasks, balancing)
    if (generatedTasks.length > 0) {
      await Task.insertMany(generatedTasks)
      existingTasks = await Task.find({
        date: { $gte: weekStart, $lt: weekEnd },
      })
    }
  }

  return existingTasks
}

export async function regenerateWeek(startDate: Date) {
  const weekStart = new Date(startDate)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = addDays(weekStart, 7)

  await Task.deleteMany({
    date: { $gte: weekStart, $lt: weekEnd },
    source: 'auto-generated',
  })

  const threads = await Thread.find()
  const balancing = await loadBalancing()
  const generatedTasks = await generateWeek(weekStart, threads, [], balancing)

  if (generatedTasks.length > 0) {
    await Task.insertMany(generatedTasks)
  }

  return await Task.find({
    date: { $gte: weekStart, $lt: weekEnd },
  })
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
    maxDailyIntensity: settings.gridBalancing.maxDailyIntensity,
    preferLowIntensityOnBusyDays: settings.gridBalancing.preferLowIntensityOnBusyDays,
  }
}
