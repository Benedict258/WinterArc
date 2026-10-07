import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { WeeklyProgress } from '../models/WeeklyProgress'
import { Settings } from '../models/Settings'

// ============================================
// Day keys
// ============================================
// All scheduling works on 'YYYY-MM-DD' day keys in the user's timezone.
// A day is stored in Mongo as UTC midnight of its key — the same thing the
// frontend produces when it sends a 'YYYY-MM-DD' string, and what
// taskService.getTasks() filters on.

export const DEFAULT_TIMEZONE = 'Africa/Lagos'
const TIME_BLOCKS = ['morning', 'afternoon', 'evening'] as const
type TimeBlock = typeof TIME_BLOCKS[number]

export function toDayKey(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

export function dateToDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDaysKey(key: string, days: number): string {
  const d = dayKeyToDate(key)
  d.setUTCDate(d.getUTCDate() + days)
  return dateToDayKey(d)
}

/** 0 = Monday … 6 = Sunday (the convention used by Thread.fixedDay and the UI). */
export function mondayIndex(key: string): number {
  return (dayKeyToDate(key).getUTCDay() + 6) % 7
}

export function weekStartKey(key: string): string {
  return addDaysKey(key, -mondayIndex(key))
}

// ============================================
// Pure planner
// ============================================

export type Frequency = 'daily' | 'multiple' | 'weekly' | 'fixed-day'
type Priority = 'low' | 'medium' | 'high'
type Intensity = 'light' | 'medium' | 'heavy'

export type PlanThread = {
  id: string
  name: string
  frequency: Frequency
  fixedDay?: number | null
  taskMode: 'discrete' | 'continuous'
  priority: Priority
  intensity: Intensity
}

export type PlanTask = {
  id: string
  threadId: string | null
  title: string
  dueKey: string | null
  priority: Priority
  intensity: Intensity
  createdAt: number
}

export type PlanState = {
  /** appearances this week, keyed by threadId */
  appearances: Map<string, number>
  /** pending, unscheduled tasks (thread queues + backlog). Consumed tasks are removed. */
  queue: PlanTask[]
  /** existing load per block for the day being planned */
  blockLoads: Record<TimeBlock, number>
  /** intensity already on the day being planned (light=1, medium=2, heavy=4) */
  dayLoad?: number
}

export type PlanAction = {
  kind: 'due' | 'queued' | 'placeholder'
  threadId: string | null
  taskId: string | null
  title: string
  timeBlock: TimeBlock
  priority: Priority
  intensity: Intensity
  dueKey: string | null
}

export type PlanOptions = {
  multipleTarget?: number
  /** how many days ahead a due date pulls a task onto today */
  dueWindowDays?: number
  /** Grid balancing: cap on a day's summed intensity. Undefined = no cap. */
  maxDailyIntensity?: number
  /** Grid balancing: once a day is half full, place lighter work first and skip heavy. */
  preferLowIntensityOnBusyDays?: boolean
}

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }
export const INTENSITY_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 4 }
const HEAVY = INTENSITY_WEIGHT.heavy

export function intensityWeight(intensity: string | undefined): number {
  return INTENSITY_WEIGHT[intensity || 'medium'] ?? 2
}

export function getTarget(frequency: Frequency, multipleTarget = 3): number {
  switch (frequency) {
    case 'daily': return 7
    case 'multiple': return multipleTarget
    case 'weekly': return 1
    case 'fixed-day': return 1
  }
}

/** Stable value in [0, 1) per thread, used to spread threads across the week. */
export function threadPhase(threadId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < threadId.length; i++) {
    h ^= threadId.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 2 ** 32
}

/**
 * How many appearances a thread should have had by the end of `dayIdx`
 * (0 = Monday). Spreads a weekly target evenly instead of front-loading
 * every thread onto Monday; the phase staggers threads with the same target.
 * Always reaches `target` by Sunday.
 */
export function paceQuota(target: number, dayIdx: number, phase: number): number {
  return Math.max(0, Math.ceil((target * (dayIdx + 1)) / 7 - phase))
}

function pickBlock(loads: Record<TimeBlock, number>): TimeBlock {
  return [...TIME_BLOCKS].sort((a, b) => loads[a] - loads[b])[0]
}

function byPriorityThenDue(a: PlanTask, b: PlanTask): number {
  const pri = (PRIORITY_RANK[b.priority] ?? 2) - (PRIORITY_RANK[a.priority] ?? 2)
  if (pri !== 0) return pri
  if (a.dueKey !== b.dueKey) {
    if (a.dueKey === null) return 1
    if (b.dueKey === null) return -1
    return a.dueKey < b.dueKey ? -1 : 1
  }
  return a.createdAt - b.createdAt
}

/**
 * Decide what goes on `dayKey`. Mutates `state` (consumes queued tasks,
 * bumps appearances, block loads and day load) so it can be called day after
 * day to simulate a week.
 *
 * Grid balancing: due-date tasks and fixed-day threads are always placed
 * (they can't move). Everything else only goes in if it fits under
 * `maxDailyIntensity`; a thread that doesn't fit stays behind pace and is
 * picked up on a later day.
 */
export function planDay(dayKey: string, threads: PlanThread[], state: PlanState, opts: PlanOptions = {}): PlanAction[] {
  const dueWindowEnd = addDaysKey(dayKey, opts.dueWindowDays ?? 3)
  const dayIdx = mondayIndex(dayKey)
  const threadById = new Map(threads.map(t => [t.id, t]))
  const actions: PlanAction[] = []
  const scheduledThreadIds = new Set<string>()
  const cap = opts.maxDailyIntensity ?? Infinity
  state.dayLoad = state.dayLoad ?? 0

  const isBusy = () => opts.preferLowIntensityOnBusyDays === true && state.dayLoad! >= cap / 2
  const fits = (weight: number) => state.dayLoad! + weight <= cap && !(isBusy() && weight >= HEAVY)

  const place = (action: Omit<PlanAction, 'timeBlock'>) => {
    const block = pickBlock(state.blockLoads)
    state.blockLoads[block] += 1
    state.dayLoad! += intensityWeight(action.intensity)
    actions.push({ ...action, timeBlock: block })
  }

  const consume = (task: PlanTask, kind: PlanAction['kind']) => {
    state.queue = state.queue.filter(t => t.id !== task.id)
    place({
      kind,
      threadId: task.threadId,
      taskId: task.id,
      title: task.title,
      priority: task.priority,
      intensity: task.intensity,
      dueKey: task.dueKey,
    })
  }

  const bump = (threadId: string) => {
    state.appearances.set(threadId, (state.appearances.get(threadId) ?? 0) + 1)
    scheduledThreadIds.add(threadId)
  }

  // 1. Due-date pass. Anything due within the window — or already overdue —
  //    is placed today, ahead of the normal rotation and regardless of the
  //    cap. Per thread, only the highest-priority due tasks go in.
  const dueTasks = state.queue.filter(t => t.dueKey !== null && t.dueKey <= dueWindowEnd)
  const dueByThread = new Map<string, PlanTask[]>()
  for (const t of dueTasks) {
    const k = t.threadId ?? '__backlog__'
    if (!dueByThread.has(k)) dueByThread.set(k, [])
    dueByThread.get(k)!.push(t)
  }
  for (const [key, tasks] of dueByThread) {
    const maxRank = Math.max(...tasks.map(t => PRIORITY_RANK[t.priority] ?? 2))
    const eligible = key === '__backlog__'
      ? tasks
      : tasks.filter(t => (PRIORITY_RANK[t.priority] ?? 2) === maxRank)
    eligible.sort((a, b) => (a.dueKey! < b.dueKey! ? -1 : a.dueKey! > b.dueKey! ? 1 : a.createdAt - b.createdAt))
    for (const task of eligible) {
      consume(task, 'due')
      if (task.threadId && threadById.has(task.threadId)) bump(task.threadId)
    }
  }

  // 2. Normal pass over threads that are behind their pace for the week.
  type Candidate = { thread: PlanThread; deficit: number }
  const candidates: Candidate[] = []
  for (const thread of threads) {
    if (scheduledThreadIds.has(thread.id)) continue
    const target = getTarget(thread.frequency, opts.multipleTarget)
    const appearances = state.appearances.get(thread.id) ?? 0
    if (appearances >= target) continue

    if (thread.frequency === 'fixed-day') {
      if (thread.fixedDay !== dayIdx) continue
    } else if (appearances >= paceQuota(target, dayIdx, threadPhase(thread.id))) {
      continue
    }
    candidates.push({ thread, deficit: target - appearances })
  }

  const byNeed = (a: Candidate, b: Candidate) =>
    (b.deficit - a.deficit) ||
    ((PRIORITY_RANK[b.thread.priority] ?? 2) - (PRIORITY_RANK[a.thread.priority] ?? 2)) ||
    a.thread.name.localeCompare(b.thread.name)

  /** What this thread would put on the day, given the current load. */
  const pickFor = (thread: PlanThread): { task: PlanTask | null; weight: number } | null => {
    const queued = state.queue.filter(t => t.threadId === thread.id).sort(byPriorityThenDue)
    if (queued.length) {
      if (thread.frequency === 'fixed-day') return { task: queued[0], weight: intensityWeight(queued[0].intensity) }
      // Best-priority task that fits; on busy days the lightest that fits
      const options = isBusy()
        ? [...queued].sort((a, b) => intensityWeight(a.intensity) - intensityWeight(b.intensity) || byPriorityThenDue(a, b))
        : queued
      const task = options.find(t => fits(intensityWeight(t.intensity)))
      return task ? { task, weight: intensityWeight(task.intensity) } : null
    }
    if (thread.taskMode !== 'continuous') return null // discrete, empty queue: skip
    const weight = intensityWeight(thread.intensity)
    if (thread.frequency !== 'fixed-day' && !fits(weight)) return null
    return { task: null, weight }
  }

  const remaining = [...candidates].sort(byNeed)
  while (remaining.length) {
    // On busy days, take the lightest available work next; otherwise most-behind first
    let index = 0
    let pick = pickFor(remaining[0].thread)
    if (isBusy()) {
      let best = -1
      let bestPick: ReturnType<typeof pickFor> = null
      remaining.forEach((c, i) => {
        const p = pickFor(c.thread)
        if (p && (bestPick === null || p.weight < bestPick.weight)) {
          best = i
          bestPick = p
        }
      })
      if (best >= 0) {
        index = best
        pick = bestPick
      }
    }
    const [{ thread }] = remaining.splice(index, 1)
    if (!pick) continue // doesn't fit today; stays behind pace for a later day

    if (pick.task) {
      consume(pick.task, 'queued')
    } else {
      place({
        kind: 'placeholder',
        threadId: thread.id,
        taskId: null,
        title: thread.name,
        priority: thread.priority,
        intensity: thread.intensity,
        dueKey: null,
      })
    }
    bump(thread.id)
  }

  return actions
}

// ============================================
// DB adapters
// ============================================

function toPlanThread(t: any): PlanThread {
  return {
    id: String(t._id),
    name: t.name,
    frequency: t.frequency,
    fixedDay: typeof t.fixedDay === 'number' ? t.fixedDay : null,
    taskMode: t.taskMode === 'discrete' ? 'discrete' : 'continuous',
    priority: t.priority || 'medium',
    intensity: t.intensity || 'medium',
  }
}

function toPlanTask(t: any): PlanTask {
  return {
    id: String(t._id),
    threadId: t.threadId ? String(t.threadId) : null,
    title: t.title,
    dueKey: t.dueDate ? dateToDayKey(new Date(t.dueDate)) : null,
    priority: t.priority || 'medium',
    intensity: t.intensity || 'medium',
    createdAt: t.createdAt ? new Date(t.createdAt).getTime() : 0,
  }
}

async function loadSchedulingSettings() {
  const settings = await Settings.findOne()
  return {
    timezone: settings?.timezone || DEFAULT_TIMEZONE,
    multipleTarget: settings?.multipleThreadsPerWeekTarget || 3,
    planOptions: {
      multipleTarget: settings?.multipleThreadsPerWeekTarget || 3,
      maxDailyIntensity: settings?.gridBalancing?.maxDailyIntensity ?? 6,
      preferLowIntensityOnBusyDays: settings?.gridBalancing?.preferLowIntensityOnBusyDays ?? true,
    } satisfies PlanOptions,
  }
}

/** Tasks already on a day: per-block counts and summed intensity (skipped tasks don't count). */
async function loadDayLoad(dayKey: string): Promise<{ blockLoads: Record<TimeBlock, number>; dayLoad: number }> {
  const start = dayKeyToDate(dayKey)
  const end = dayKeyToDate(addDaysKey(dayKey, 1))
  const tasks = await Task.find({ date: { $gte: start, $lt: end }, status: { $ne: 'skipped' } }, { timeBlock: 1, intensity: 1 })
  const blockLoads: Record<TimeBlock, number> = { morning: 0, afternoon: 0, evening: 0 }
  let dayLoad = 0
  for (const t of tasks) {
    if (t.timeBlock && t.timeBlock in blockLoads) blockLoads[t.timeBlock as TimeBlock] += 1
    dayLoad += intensityWeight(t.intensity ?? undefined)
  }
  return { blockLoads, dayLoad }
}

async function loadQueue(): Promise<PlanTask[]> {
  const docs = await Task.find({ date: null, status: 'pending' })
  return docs.map(toPlanTask)
}

async function loadAppearances(threadIds: string[], weekKey: string): Promise<Map<string, number>> {
  const docs = await WeeklyProgress.find({ threadId: { $in: threadIds }, weekStart: dayKeyToDate(weekKey) })
  return new Map(docs.map(p => [String(p.threadId), p.appearances]))
}

/** Plan `dayKey` and write it to the database. */
export async function generateToday(dayKey: string) {
  const { planOptions } = await loadSchedulingSettings()
  const threadDocs = await Thread.find({ status: 'active' })
  const threads = threadDocs.map(toPlanThread)
  const weekKey = weekStartKey(dayKey)

  const state: PlanState = {
    appearances: await loadAppearances(threads.map(t => t.id), weekKey),
    queue: await loadQueue(),
    ...(await loadDayLoad(dayKey)),
  }

  const actions = planDay(dayKey, threads, state, planOptions)
  const date = dayKeyToDate(dayKey)
  const weekStart = dayKeyToDate(weekKey)

  for (const a of actions) {
    if (a.taskId) {
      // Only commit if it's still unscheduled — guards against a concurrent edit.
      await Task.updateOne({ _id: a.taskId, date: null }, { $set: { date, timeBlock: a.timeBlock, scheduledBy: 'generator' } })
    } else {
      await Task.create({
        title: a.title,
        threadId: a.threadId,
        date,
        timeBlock: a.timeBlock,
        source: 'auto-generated',
        scheduledBy: 'generator',
        status: 'pending',
        priority: a.priority,
        intensity: a.intensity,
      })
    }
    if (a.threadId && threads.some(t => t.id === a.threadId)) {
      await WeeklyProgress.updateOne(
        { threadId: a.threadId, weekStart },
        { $inc: { appearances: 1 } },
        { upsert: true }
      )
    }
  }

  return actions
}

let inFlight: Promise<{ dayKey: string; generated: boolean }> | null = null
// Fast path so per-request calls don't hit Mongo once today is done
let knownGenerated: { dayKey: string; timezone: string } | null = null

/**
 * Runs generateToday() at most once per day. The day is claimed atomically
 * on the Settings document so a restart (or a second process) can't double
 * schedule. Safe to call on every request.
 */
export function ensureTodayGenerated(now = new Date()): Promise<{ dayKey: string; generated: boolean }> {
  if (knownGenerated && toDayKey(now, knownGenerated.timezone) === knownGenerated.dayKey) {
    return Promise.resolve({ dayKey: knownGenerated.dayKey, generated: false })
  }
  if (inFlight) return inFlight
  inFlight = (async () => {
    const { timezone } = await loadSchedulingSettings()
    const dayKey = toDayKey(now, timezone)

    let settings = await Settings.findOne()
    if (!settings) settings = await Settings.create({ timezone })
    if (settings.lastGeneratedDate === dayKey) {
      knownGenerated = { dayKey, timezone }
      return { dayKey, generated: false }
    }

    const previous = settings.lastGeneratedDate ?? null
    const claim = await Settings.updateOne(
      { _id: settings._id, lastGeneratedDate: previous },
      { $set: { lastGeneratedDate: dayKey } }
    )
    if (claim.modifiedCount === 0) return { dayKey, generated: false }

    try {
      await generateToday(dayKey)
    } catch (err) {
      await Settings.updateOne({ _id: settings._id, lastGeneratedDate: dayKey }, { $set: { lastGeneratedDate: previous } })
      throw err
    }
    knownGenerated = { dayKey, timezone }
    return { dayKey, generated: true }
  })().finally(() => { inFlight = null })
  return inFlight
}

export type ForecastEntry = PlanAction & { date: string }

/**
 * Read-only forecast for the not-yet-reached days of the week starting at
 * `requestedWeekKey`. Simulates every day from tomorrow forward using the
 * current queue and weekly progress; nothing is written.
 */
export async function forecastWeek(requestedWeekKey: string, now = new Date()): Promise<ForecastEntry[]> {
  const { timezone, planOptions } = await loadSchedulingSettings()
  const todayKey = toDayKey(now, timezone)
  const requestedEnd = addDaysKey(requestedWeekKey, 6)
  if (requestedEnd <= todayKey) return []

  const threads = (await Thread.find({ status: 'active' })).map(toPlanThread)
  const queue = await loadQueue()
  let currentWeek = weekStartKey(todayKey)
  let appearances = await loadAppearances(threads.map(t => t.id), currentWeek)
  const state: PlanState = { appearances, queue, blockLoads: { morning: 0, afternoon: 0, evening: 0 } }

  const out: ForecastEntry[] = []
  for (let day = addDaysKey(todayKey, 1); day <= requestedEnd; day = addDaysKey(day, 1)) {
    const wk = weekStartKey(day)
    if (wk !== currentWeek) {
      currentWeek = wk
      appearances = new Map()
      state.appearances = appearances
    }
    Object.assign(state, await loadDayLoad(day))
    const actions = planDay(day, threads, state, planOptions)
    if (day >= requestedWeekKey) {
      for (const a of actions) out.push({ ...a, date: day })
    }
  }
  return out
}

export type RebalanceResult = {
  dayKey: string
  removedPlaceholders: number
  returnedToQueue: number
  scheduled: number
  load: number
  maxDailyIntensity: number
}

/**
 * Re-plan today with the current settings and queue. Undoes only what the
 * generator placed on today and is still pending: placeholders are removed,
 * committed queue tasks go back to their thread's queue. Tasks you created
 * or scheduled yourself, and anything done/skipped, are left alone.
 */
let rebalancing: Promise<RebalanceResult> | null = null

export function rebalanceToday(now = new Date()): Promise<RebalanceResult> {
  // A double-click must not undo/replan twice concurrently
  if (!rebalancing) rebalancing = doRebalance(now).finally(() => { rebalancing = null })
  return rebalancing
}

async function doRebalance(now: Date): Promise<RebalanceResult> {
  // Don't race the once-a-day generation
  await ensureTodayGenerated(now)
  const { timezone, planOptions } = await loadSchedulingSettings()
  const dayKey = toDayKey(now, timezone)
  const start = dayKeyToDate(dayKey)
  const end = dayKeyToDate(addDaysKey(dayKey, 1))

  const placed = await Task.find({
    date: { $gte: start, $lt: end },
    status: 'pending',
    $or: [
      { scheduledBy: 'generator' },
      // Placed before scheduledBy existed: generator placeholders, and thread
      // tasks created on an earlier day (i.e. pulled from the queue today)
      { scheduledBy: { $exists: false }, source: 'auto-generated' },
      { scheduledBy: { $exists: false }, source: 'manual', threadId: { $ne: null }, createdAt: { $lt: start } },
    ],
  })

  let removedPlaceholders = 0
  let returnedToQueue = 0
  const weekStart = dayKeyToDate(weekStartKey(dayKey))
  for (const t of placed) {
    if (t.source === 'auto-generated') {
      await Task.deleteOne({ _id: t._id, status: 'pending' })
      removedPlaceholders++
    } else {
      await Task.updateOne(
        { _id: t._id, status: 'pending' },
        { $set: { date: null, timeBlock: 'unscheduled', scheduledBy: null } }
      )
      returnedToQueue++
    }
    if (t.threadId) {
      await WeeklyProgress.updateOne(
        { threadId: t.threadId, weekStart, appearances: { $gt: 0 } },
        { $inc: { appearances: -1 } }
      )
    }
  }

  const actions = await generateToday(dayKey)
  const { dayLoad } = await loadDayLoad(dayKey)
  return {
    dayKey,
    removedPlaceholders,
    returnedToQueue,
    scheduled: actions.length,
    load: dayLoad,
    maxDailyIntensity: planOptions.maxDailyIntensity,
  }
}
