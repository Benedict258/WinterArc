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
}

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

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
 * bumps appearances and block loads) so it can be called day after day to
 * simulate a week.
 */
export function planDay(dayKey: string, threads: PlanThread[], state: PlanState, opts: PlanOptions = {}): PlanAction[] {
  const dueWindowEnd = addDaysKey(dayKey, opts.dueWindowDays ?? 3)
  const dayIdx = mondayIndex(dayKey)
  const threadById = new Map(threads.map(t => [t.id, t]))
  const actions: PlanAction[] = []
  const scheduledThreadIds = new Set<string>()

  const consume = (task: PlanTask, kind: PlanAction['kind']) => {
    const block = pickBlock(state.blockLoads)
    state.blockLoads[block] += 1
    state.queue = state.queue.filter(t => t.id !== task.id)
    actions.push({
      kind,
      threadId: task.threadId,
      taskId: task.id,
      title: task.title,
      timeBlock: block,
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
  //    is placed today, ahead of the normal rotation. Per thread, only the
  //    highest-priority due tasks go in, earliest due first.
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

  candidates.sort((a, b) =>
    (b.deficit - a.deficit) ||
    ((PRIORITY_RANK[b.thread.priority] ?? 2) - (PRIORITY_RANK[a.thread.priority] ?? 2)) ||
    a.thread.name.localeCompare(b.thread.name)
  )

  for (const { thread } of candidates) {
    const queued = state.queue.filter(t => t.threadId === thread.id).sort(byPriorityThenDue)[0]
    if (queued) {
      consume(queued, 'queued')
      bump(thread.id)
    } else if (thread.taskMode === 'continuous') {
      const block = pickBlock(state.blockLoads)
      state.blockLoads[block] += 1
      actions.push({
        kind: 'placeholder',
        threadId: thread.id,
        taskId: null,
        title: thread.name,
        timeBlock: block,
        priority: thread.priority,
        intensity: thread.intensity,
        dueKey: null,
      })
      bump(thread.id)
    }
    // discrete with an empty queue: skipped, no slot used
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
  }
}

async function loadBlockLoads(dayKey: string): Promise<Record<TimeBlock, number>> {
  const start = dayKeyToDate(dayKey)
  const end = dayKeyToDate(addDaysKey(dayKey, 1))
  const tasks = await Task.find({ date: { $gte: start, $lt: end }, timeBlock: { $in: TIME_BLOCKS } }, { timeBlock: 1 })
  const loads: Record<TimeBlock, number> = { morning: 0, afternoon: 0, evening: 0 }
  for (const t of tasks) loads[t.timeBlock as TimeBlock] += 1
  return loads
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
  const { multipleTarget } = await loadSchedulingSettings()
  const threadDocs = await Thread.find({ status: 'active' })
  const threads = threadDocs.map(toPlanThread)
  const weekKey = weekStartKey(dayKey)

  const state: PlanState = {
    appearances: await loadAppearances(threads.map(t => t.id), weekKey),
    queue: await loadQueue(),
    blockLoads: await loadBlockLoads(dayKey),
  }

  const actions = planDay(dayKey, threads, state, { multipleTarget })
  const date = dayKeyToDate(dayKey)
  const weekStart = dayKeyToDate(weekKey)

  for (const a of actions) {
    if (a.taskId) {
      // Only commit if it's still unscheduled — guards against a concurrent edit.
      await Task.updateOne({ _id: a.taskId, date: null }, { $set: { date, timeBlock: a.timeBlock } })
    } else {
      await Task.create({
        title: a.title,
        threadId: a.threadId,
        date,
        timeBlock: a.timeBlock,
        source: 'auto-generated',
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
  const { timezone, multipleTarget } = await loadSchedulingSettings()
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
    state.blockLoads = await loadBlockLoads(day)
    const actions = planDay(day, threads, state, { multipleTarget })
    if (day >= requestedWeekKey) {
      for (const a of actions) out.push({ ...a, date: day })
    }
  }
  return out
}
