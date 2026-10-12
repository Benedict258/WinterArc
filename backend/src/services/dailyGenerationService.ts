import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { DayBlock, normalizeBlocks, blockForTime, pickBlock, resolveBlock, emptyLoads } from '../../../src/shared/dayBlocks'
import { User } from '../models/User'

// ============================================
// Day keys
// ============================================
// All scheduling works on 'YYYY-MM-DD' day keys in the user's timezone.
// A day is stored in Mongo as UTC midnight of its key — the same thing the
// frontend produces when it sends a 'YYYY-MM-DD' string, and what
// taskService.getTasks() filters on.

export const DEFAULT_TIMEZONE = 'UTC'

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
  taskMode: 'discrete' | 'continuous' | 'event'
  priority: Priority
  intensity: Intensity
  /** event threads: wall-clock 'HH:mm' in the user's timezone, and the weekdays (0 = Monday) it happens on */
  eventStart?: string | null
  eventEnd?: string | null
  eventDays?: number[]
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
  blockLoads: Record<string, number>
  /** intensity already on the day being planned (light=1, medium=2, heavy=4) */
  dayLoad?: number
  /** fixed-day threads that missed yesterday's slot and get one makeup today */
  makeup?: Set<string>
}

export type PlanAction = {
  kind: 'due' | 'queued' | 'placeholder' | 'event'
  threadId: string | null
  taskId: string | null
  title: string
  timeBlock: string
  priority: Priority
  intensity: Intensity
  dueKey: string | null
  /** events only: 'HH:mm' in the user's timezone */
  startTime?: string | null
  endTime?: string | null
}

export type PlanOptions = {
  multipleTarget?: number
  /** how many days ahead a due date pulls a task onto today */
  dueWindowDays?: number
  /** Grid balancing: cap on a day's summed intensity. Undefined = no cap. */
  maxDailyIntensity?: number
  /** Grid balancing: once a day is half full, place lighter work first and skip heavy. */
  preferLowIntensityOnBusyDays?: boolean
  /** most no-due-date backlog tasks pulled in as filler on a day (default 2) */
  backlogPerDay?: number
  /** the user's day structure (default: morning / afternoon / evening) */
  blocks?: DayBlock[]
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


// ============================================
// Scoring
// ============================================
// Placement weighs several factors instead of a single sort key. The
// numbers are relative weights; only the ordering they produce matters.

const DAY_MS = 86_400_000

/** How good a queued task is to do on `dayKey`. */
export function taskScore(task: PlanTask, dayKey: string): number {
  const day = dayKeyToDate(dayKey).getTime()
  let score = (PRIORITY_RANK[task.priority] ?? 2) * 10
  if (task.dueKey) {
    const daysLeft = Math.round((dayKeyToDate(task.dueKey).getTime() - day) / DAY_MS)
    // Far-off due dates still pull a little; it grows as the date nears
    score += daysLeft <= 0 ? 40 : 24 / Math.max(1, daysLeft - 1)
  }
  if (task.createdAt) {
    const ageDays = Math.max(0, (day - task.createdAt) / DAY_MS)
    score += Math.min(ageDays, 14) * 0.5 // waiting longer nudges it up, capped
  }
  return score
}

function bestTasksFirst(dayKey: string) {
  return (a: PlanTask, b: PlanTask) =>
    taskScore(b, dayKey) - taskScore(a, dayKey) ||
    a.createdAt - b.createdAt ||
    a.id.localeCompare(b.id)
}

/**
 * Decide what goes on `dayKey`. Mutates `state` (consumes queued tasks,
 * bumps appearances, block loads and day load) so it can be called day after
 * day to simulate a week.
 *
 * 1. Due pass — overdue and due today/tomorrow always go in; tasks due in
 *    2–3 days go in for the highest priority per thread. Ignores the cap.
 * 2. Rotation — threads behind their weekly pace (or on their fixed day)
 *    are ranked by score: how far behind they are, thread priority, the best
 *    queued task's score (priority, due date, age) and daily habits.
 *    Continuous threads with an empty queue get a placeholder; discrete ones
 *    are skipped. Everything except fixed-day threads must fit under the cap;
 *    on busy days heavy work waits and lighter work is preferred.
 * 3. Backlog filler — while the day is under half the cap, pull in up to a
 *    couple of the best no-thread, no-due-date tasks.
 * Each placement goes to a time block by intensity and current block load.
 */
export function planDay(dayKey: string, threads: PlanThread[], state: PlanState, opts: PlanOptions = {}): PlanAction[] {
  const dueWindowEnd = addDaysKey(dayKey, opts.dueWindowDays ?? 3)
  const urgentEnd = addDaysKey(dayKey, 1)
  const dayIdx = mondayIndex(dayKey)
  const threadById = new Map(threads.map(t => [t.id, t]))
  const actions: PlanAction[] = []
  const scheduledThreadIds = new Set<string>()
  const cap = opts.maxDailyIntensity ?? Infinity
  const byScore = bestTasksFirst(dayKey)
  state.dayLoad = state.dayLoad ?? 0

  const isBusy = () => opts.preferLowIntensityOnBusyDays === true && state.dayLoad! >= cap / 2
  const fits = (weight: number) => state.dayLoad! + weight <= cap && !(isBusy() && weight >= HEAVY)

  const place = (action: Omit<PlanAction, 'timeBlock'>) => {
    const weight = intensityWeight(action.intensity)
    const block = pickBlock(state.blockLoads, action.intensity, opts.blocks)
    state.blockLoads[block] = (state.blockLoads[block] ?? 0) + weight
    state.dayLoad! += weight
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

  // 0. Events — fixed by the clock, so they ignore pacing, the cap and block balancing
  for (const thread of threads) {
    if (thread.taskMode !== 'event' || !thread.eventDays?.includes(dayIdx)) continue
    actions.push({
      kind: 'event',
      threadId: thread.id,
      taskId: null,
      title: thread.name,
      timeBlock: blockForTime(thread.eventStart, opts.blocks),
      priority: thread.priority,
      intensity: thread.intensity,
      dueKey: null,
      startTime: thread.eventStart ?? null,
      endTime: thread.eventEnd ?? null,
    })
    scheduledThreadIds.add(thread.id)
  }

  // 1. Due pass
  const dueTasks = state.queue.filter(t => t.dueKey !== null && t.dueKey <= dueWindowEnd)
  const dueByThread = new Map<string, PlanTask[]>()
  for (const t of dueTasks) {
    const k = t.threadId ?? '__backlog__'
    if (!dueByThread.has(k)) dueByThread.set(k, [])
    dueByThread.get(k)!.push(t)
  }
  for (const [key, tasks] of dueByThread) {
    const urgent = tasks.filter(t => t.dueKey! <= urgentEnd)
    const soon = tasks.filter(t => t.dueKey! > urgentEnd)
    const maxRank = Math.max(0, ...soon.map(t => PRIORITY_RANK[t.priority] ?? 2))
    const eligible = [
      ...urgent,
      ...(key === '__backlog__' ? soon : soon.filter(t => (PRIORITY_RANK[t.priority] ?? 2) === maxRank)),
    ].sort((a, b) => (a.dueKey! < b.dueKey! ? -1 : a.dueKey! > b.dueKey! ? 1 : byScore(a, b)))
    for (const task of eligible) {
      consume(task, 'due')
      if (task.threadId && threadById.has(task.threadId)) bump(task.threadId)
    }
  }

  // 2. Rotation
  type Candidate = { thread: PlanThread; target: number; appearances: number }
  const candidates: Candidate[] = []
  for (const thread of threads) {
    if (scheduledThreadIds.has(thread.id) || thread.taskMode === 'event') continue
    const target = getTarget(thread.frequency, opts.multipleTarget)
    const appearances = state.appearances.get(thread.id) ?? 0
    if (appearances >= target) continue

    if (thread.frequency === 'fixed-day') {
      // Its day, or the one makeup day after missing it
      if (thread.fixedDay !== dayIdx && !state.makeup?.has(thread.id)) continue
    } else if (appearances >= paceQuota(target, dayIdx, threadPhase(thread.id))) {
      continue
    }
    candidates.push({ thread, target, appearances })
  }

  /** What this thread would put on the day right now, or null if nothing fits. */
  const pickFor = (thread: PlanThread): { task: PlanTask | null; weight: number; taskScore: number } | null => {
    const queued = state.queue.filter(t => t.threadId === thread.id).sort(byScore)
    if (queued.length) {
      if (thread.frequency === 'fixed-day') {
        return { task: queued[0], weight: intensityWeight(queued[0].intensity), taskScore: taskScore(queued[0], dayKey) }
      }
      const options = isBusy()
        ? [...queued].sort((a, b) => intensityWeight(a.intensity) - intensityWeight(b.intensity) || byScore(a, b))
        : queued
      const task = options.find(t => fits(intensityWeight(t.intensity)))
      return task ? { task, weight: intensityWeight(task.intensity), taskScore: taskScore(task, dayKey) } : null
    }
    if (thread.taskMode !== 'continuous') return null // discrete with an empty queue: not today
    const weight = intensityWeight(thread.intensity)
    if (thread.frequency !== 'fixed-day' && !fits(weight)) return null
    return { task: null, weight, taskScore: (PRIORITY_RANK[thread.priority] ?? 2) * 10 }
  }

  const candidateScore = (c: Candidate, pick: NonNullable<ReturnType<typeof pickFor>>) => {
    let score = 0
    if (c.thread.frequency === 'fixed-day') score += 1000 // its only day
    score += ((c.target - c.appearances) / c.target) * 30 // how far behind for the week
    score += (PRIORITY_RANK[c.thread.priority] ?? 2) * 8
    score += pick.taskScore
    if (c.thread.frequency === 'daily') score += 5 // keep daily habits going
    if (isBusy()) score -= pick.weight * 6 // lighter work first when the day is filling up
    return score
  }

  const remaining = [...candidates]
  while (remaining.length) {
    // Re-score each round: load, busy state and the queue change as we place
    let bestIndex = -1
    let bestPick: ReturnType<typeof pickFor> = null
    let bestScore = -Infinity
    remaining.forEach((c, i) => {
      const pick = pickFor(c.thread)
      if (!pick) return
      const score = candidateScore(c, pick)
      if (score > bestScore || (score === bestScore && c.thread.name < remaining[bestIndex].thread.name)) {
        bestIndex = i
        bestPick = pick
        bestScore = score
      }
    })
    if (bestIndex < 0) break // nothing else fits today; the rest catch up later in the week

    const [{ thread }] = remaining.splice(bestIndex, 1)
    const pick = bestPick!
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

  // 3. Backlog filler — no-thread, no-due-date tasks fill spare room on light days,
  // best first, a couple at a time so the backlog drains without crowding threads out.
  const fillerMax = opts.backlogPerDay ?? 2
  let filled = 0
  const backlog = state.queue.filter(t => t.threadId === null && t.dueKey === null).sort(byScore)
  for (const task of backlog) {
    if (filled >= fillerMax || state.dayLoad! >= cap / 2) break
    if (!fits(intensityWeight(task.intensity))) continue
    consume(task, 'queued')
    filled++
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
    taskMode: t.taskMode === 'discrete' ? 'discrete' : t.taskMode === 'event' ? 'event' : 'continuous',
    priority: t.priority || 'medium',
    intensity: t.intensity || 'medium',
    eventStart: t.eventStart ?? null,
    eventEnd: t.eventEnd ?? null,
    eventDays: Array.isArray(t.eventDays) ? t.eventDays : [],
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

async function loadSchedulingSettings(userId: string) {
  const settings = await Settings.findOne({ userId })
  return {
    timezone: settings?.timezone || DEFAULT_TIMEZONE,
    multipleTarget: settings?.multipleThreadsPerWeekTarget || 3,
    rollover: settings?.planner?.rollover ?? true,
    makeup: settings?.planner?.makeup ?? true,
    planOptions: {
      multipleTarget: settings?.multipleThreadsPerWeekTarget || 3,
      backlogPerDay: settings?.planner?.backlogPerDay ?? 2,
      dueWindowDays: settings?.planner?.dueWindowDays ?? 3,
      blocks: normalizeBlocks(settings?.planner?.blocks),
      maxDailyIntensity: settings?.gridBalancing?.maxDailyIntensity ?? 6,
      preferLowIntensityOnBusyDays: settings?.gridBalancing?.preferLowIntensityOnBusyDays ?? true,
    } satisfies PlanOptions,
  }
}

/** Tasks already on a day: per-block counts and summed intensity (skipped tasks don't count). */
async function loadDayLoad(userId: string, dayKey: string, blocks: DayBlock[]): Promise<{ blockLoads: Record<string, number>; dayLoad: number }> {
  const start = dayKeyToDate(dayKey)
  const end = dayKeyToDate(addDaysKey(dayKey, 1))
  const tasks = await Task.find({ userId, date: { $gte: start, $lt: end }, status: { $ne: 'skipped' }, isEvent: { $ne: true } }, { timeBlock: 1, intensity: 1 })
  const blockLoads = emptyLoads(blocks)
  let dayLoad = 0
  for (const t of tasks) {
    // Block load is summed intensity, so heavy work spreads across the day
    const block = resolveBlock(t.timeBlock, blocks)
    if (block in blockLoads) blockLoads[block] += intensityWeight(t.intensity ?? undefined)
    dayLoad += intensityWeight(t.intensity ?? undefined)
  }
  return { blockLoads, dayLoad }
}

async function loadQueue(userId: string): Promise<PlanTask[]> {
  const [docs, own] = await Promise.all([Task.find({ userId, date: null, status: 'pending' }), Thread.find({ userId }, { _id: 1 })])
  const mine = new Set(own.map(t => String(t._id)))
  // a task in someone else's shared thread has no rotation of mine to wait in: it is plain backlog to my planner
  return docs.map(toPlanTask).map(t => (t.threadId && !mine.has(t.threadId) ? { ...t, threadId: null } : t))
}

/**
 * Days this week on which each thread has a task (done or pending, not skipped,
 * not an event). Counting real tasks means work you add by hand counts toward
 * the weekly target, and undoing a placement never leaves the count off.
 */
async function loadAppearances(userId: string, threadIds: string[], weekKey: string): Promise<Map<string, number>> {
  const docs = await Task.find(
    {
      userId,
      threadId: { $in: threadIds },
      date: { $gte: dayKeyToDate(weekKey), $lt: dayKeyToDate(addDaysKey(weekKey, 7)) },
      status: { $ne: 'skipped' },
      isEvent: { $ne: true },
    },
    { threadId: 1, date: 1 }
  )
  const daysByThread = new Map<string, Set<string>>()
  for (const t of docs) {
    const id = String(t.threadId)
    if (!daysByThread.has(id)) daysByThread.set(id, new Set())
    daysByThread.get(id)!.add(dateToDayKey(t.date as Date))
  }
  return new Map([...daysByThread].map(([id, days]) => [id, days.size]))
}

const ROLLOVER_DAYS = 14

/**
 * Deal with unfinished work from earlier days (last two weeks), so Today starts clean:
 *  - events that passed are marked skipped (missed);
 *  - placeholders ("work on <thread>") are skipped — they were only a nudge;
 *  - real tasks the planner placed go back to their queue to be rescheduled;
 *  - tasks you scheduled yourself stay put (Today shows them as Overdue).
 * Every moved item records `missedOn`. Returns the fixed-day threads whose slot
 * was missed yesterday — they get one makeup today.
 */
export async function rolloverMissed(
  userId: string,
  dayKey: string,
  threads: PlanThread[],
  rules: { rollover?: boolean; makeup?: boolean } = {}
): Promise<Set<string>> {
  if (rules.rollover === false) return new Set()
  const todayStart = dayKeyToDate(dayKey)
  const past = await Task.find({
    userId,
    status: 'pending',
    date: { $gte: dayKeyToDate(addDaysKey(dayKey, -ROLLOVER_DAYS)), $lt: todayStart },
  })

  const ops: any[] = []
  for (const t of past) {
    const where = { _id: t._id, userId, status: 'pending' }
    if (t.isEvent || t.source === 'auto-generated') {
      ops.push({ updateOne: { filter: where, update: { $set: { status: 'skipped', missedOn: t.date } } } })
    } else if (t.scheduledBy === 'generator') {
      ops.push({ updateOne: { filter: where, update: { $set: { missedOn: t.date, date: null, timeBlock: 'unscheduled', scheduledBy: null } } } })
    }
  }
  if (ops.length) await Task.bulkWrite(ops)

  if (rules.makeup === false) return new Set()
  const yesterday = addDaysKey(dayKey, -1)
  const owed = threads.filter(t => t.frequency === 'fixed-day' && t.taskMode !== 'event' &&
    t.fixedDay === mondayIndex(yesterday) && t.fixedDay !== mondayIndex(dayKey))
  if (!owed.length) return new Set()
  const missed = await Task.find({ userId, threadId: { $in: owed.map(t => t.id) }, missedOn: dayKeyToDate(yesterday) }, { threadId: 1 })
  return new Set(missed.map(t => String(t.threadId)))
}

/** Plan `dayKey` and write it to the database. */
export async function generateToday(userId: string, dayKey: string) {
  const { planOptions, rollover, makeup: makeupRule } = await loadSchedulingSettings(userId)
  const threadDocs = await Thread.find({ userId, status: 'active' })
  const threads = threadDocs.map(toPlanThread)
  const weekKey = weekStartKey(dayKey)

  const makeup = await rolloverMissed(userId, dayKey, threads, { rollover, makeup: makeupRule })
  const state: PlanState = {
    appearances: await loadAppearances(userId, threads.map(t => t.id), weekKey),
    queue: await loadQueue(userId),
    makeup,
    ...(await loadDayLoad(userId, dayKey, planOptions.blocks)),
  }

  const actions = planDay(dayKey, threads, state, planOptions)
  const date = dayKeyToDate(dayKey)

  for (const a of actions) {
    if (a.kind === 'event') {
      // Rebalance re-plans today; don't duplicate an event that survived (e.g. already done)
      const exists = await Task.exists({ userId, threadId: a.threadId, date, isEvent: true })
      if (!exists) {
        await Task.create({
          userId,
          title: a.title,
          threadId: a.threadId,
          date,
          timeBlock: a.timeBlock,
          startTime: a.startTime,
          endTime: a.endTime,
          isEvent: true,
          source: 'auto-generated',
          scheduledBy: 'generator',
          status: 'pending',
          priority: a.priority,
          intensity: a.intensity,
        })
      }
      continue
    }
    if (a.taskId) {
      // Only commit if it's still unscheduled — guards against a concurrent edit.
      await Task.updateOne({ _id: a.taskId, userId, date: null }, { $set: { date, timeBlock: a.timeBlock, scheduledBy: 'generator' } })
    } else {
      await Task.create({
        userId,
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
  }

  return actions
}

const inFlight = new Map<string, Promise<{ dayKey: string; generated: boolean }>>()
// Fast path so per-request calls don't hit Mongo once a user's day is done
const knownGenerated = new Map<string, { dayKey: string; timezone: string }>()

/**
 * Runs generateToday() at most once per user per day. The day is claimed atomically
 * on the user's Settings document so a restart (or a second process) can't double
 * schedule. Safe to call on every request.
 */
export function ensureTodayGenerated(userId: string, now = new Date()): Promise<{ dayKey: string; generated: boolean }> {
  const known = knownGenerated.get(userId)
  if (known && toDayKey(now, known.timezone) === known.dayKey) {
    return Promise.resolve({ dayKey: known.dayKey, generated: false })
  }
  const running = inFlight.get(userId)
  if (running) return running
  const job = (async () => {
    const { timezone } = await loadSchedulingSettings(userId)
    const dayKey = toDayKey(now, timezone)

    let settings = await Settings.findOne({ userId })
    if (!settings) settings = await Settings.create({ userId, timezone })
    if (settings.lastGeneratedDate === dayKey) {
      knownGenerated.set(userId, { dayKey, timezone })
      return { dayKey, generated: false }
    }

    const previous = settings.lastGeneratedDate ?? null
    const claim = await Settings.updateOne(
      { _id: settings._id, userId, lastGeneratedDate: previous },
      { $set: { lastGeneratedDate: dayKey } }
    )
    if (claim.modifiedCount === 0) return { dayKey, generated: false }

    try {
      await generateToday(userId, dayKey)
    } catch (err) {
      await Settings.updateOne({ _id: settings._id, userId, lastGeneratedDate: dayKey }, { $set: { lastGeneratedDate: previous } })
      throw err
    }
    knownGenerated.set(userId, { dayKey, timezone })
    return { dayKey, generated: true }
  })().finally(() => { inFlight.delete(userId) })
  inFlight.set(userId, job)
  return job
}

export type ForecastEntry = PlanAction & { date: string }

/**
 * Read-only forecast for the not-yet-reached days of the week starting at
 * `requestedWeekKey`. Simulates every day from tomorrow forward using the
 * current queue and weekly progress; nothing is written.
 */
export async function forecastWeek(userId: string, requestedWeekKey: string, now = new Date()): Promise<ForecastEntry[]> {
  const { timezone, planOptions } = await loadSchedulingSettings(userId)
  const todayKey = toDayKey(now, timezone)
  const requestedEnd = addDaysKey(requestedWeekKey, 6)
  if (requestedEnd <= todayKey) return []

  const threads = (await Thread.find({ userId, status: 'active' })).map(toPlanThread)
  const queue = await loadQueue(userId)
  let currentWeek = weekStartKey(todayKey)
  let appearances = await loadAppearances(userId, threads.map(t => t.id), currentWeek)
  const state: PlanState = { appearances, queue, blockLoads: emptyLoads(planOptions.blocks) }

  const out: ForecastEntry[] = []
  for (let day = addDaysKey(todayKey, 1); day <= requestedEnd; day = addDaysKey(day, 1)) {
    const wk = weekStartKey(day)
    if (wk !== currentWeek) {
      currentWeek = wk
      appearances = new Map()
      state.appearances = appearances
    }
    Object.assign(state, await loadDayLoad(userId, day, planOptions.blocks))
    const actions = planDay(day, threads, state, planOptions)
    if (day >= requestedWeekKey) {
      for (const a of actions) out.push({ ...a, date: day })
    }
  }
  return out
}

export type RebalanceResult = {
  dayKey: string
  weekStart: string
  /** generator placeholders removed from today */
  removedPlaceholders: number
  /** generator-placed queue tasks (today + unfinished earlier this week) sent back to their queue */
  returnedToQueue: number
  /** leftover old-generator tasks removed from the rest of the week */
  removedFutureLeftovers: number
  scheduled: number
  load: number
  maxDailyIntensity: number
  /** forecast load for each remaining day this week, after rebalancing */
  forecastLoads: Record<string, number>
}

const rebalancing = new Map<string, Promise<RebalanceResult>>()

/**
 * Rebalance the current week with the current settings and queues.
 *
 * - Earlier days: unfinished queue tasks the generator placed go back to
 *   their queue so they get rescheduled (your own and finished tasks stay).
 * - Today: the generator's pending placements are undone and today is
 *   re-planned under the daily cap.
 * - Rest of the week: leftover tasks from the old weekly generator are
 *   removed; those days are forecast live and committed one day at a time.
 */
export function rebalanceWeek(userId: string, now = new Date()): Promise<RebalanceResult> {
  // A double-click must not undo/replan twice concurrently
  let job = rebalancing.get(userId)
  if (!job) {
    job = doRebalance(userId, now).finally(() => { rebalancing.delete(userId) })
    rebalancing.set(userId, job)
  }
  return job
}

async function doRebalance(userId: string, now: Date): Promise<RebalanceResult> {
  // Don't race the once-a-day generation
  await ensureTodayGenerated(userId, now)
  const { timezone, planOptions } = await loadSchedulingSettings(userId)
  const dayKey = toDayKey(now, timezone)
  const weekKey = weekStartKey(dayKey)
  const weekStartDate = dayKeyToDate(weekKey)
  const todayStart = dayKeyToDate(dayKey)
  const tomorrowStart = dayKeyToDate(addDaysKey(dayKey, 1))
  const weekEnd = dayKeyToDate(addDaysKey(weekKey, 7))

  const undo = await Task.find({
    userId,
    status: 'pending',
    $or: [
      // Earlier this week: only what the generator provably placed
      { date: { $gte: weekStartDate, $lt: todayStart }, scheduledBy: 'generator', source: { $ne: 'auto-generated' } },
      // Today
      { date: { $gte: todayStart, $lt: tomorrowStart }, scheduledBy: 'generator' },
      // Today, placed before scheduledBy existed: placeholders, and thread
      // tasks created on an earlier day (i.e. pulled from the queue today)
      { date: { $gte: todayStart, $lt: tomorrowStart }, scheduledBy: { $exists: false }, source: 'auto-generated' },
      { date: { $gte: todayStart, $lt: tomorrowStart }, scheduledBy: { $exists: false }, source: 'manual', threadId: { $ne: null }, createdAt: { $lt: todayStart } },
    ],
  })

  let removedPlaceholders = 0
  let returnedToQueue = 0
  for (const t of undo) {
    if (t.source === 'auto-generated') {
      await Task.deleteOne({ _id: t._id, userId, status: 'pending' })
      removedPlaceholders++
    } else {
      await Task.updateOne(
        { _id: t._id, userId, status: 'pending' },
        { $set: { date: null, timeBlock: 'unscheduled', scheduledBy: null } }
      )
      returnedToQueue++
    }
  }

  // The daily generator never commits future days, so any pending
  // auto-generated task after today is a leftover from the old weekly grid.
  const leftovers = await Task.deleteMany({
    userId,
    date: { $gte: tomorrowStart, $lt: weekEnd },
    status: 'pending',
    source: 'auto-generated',
  })

  const actions = await generateToday(userId, dayKey)
  const { dayLoad } = await loadDayLoad(userId, dayKey, planOptions.blocks)

  const forecastLoads: Record<string, number> = {}
  for (let d = addDaysKey(dayKey, 1); d < addDaysKey(weekKey, 7); d = addDaysKey(d, 1)) {
    forecastLoads[d] = (await loadDayLoad(userId, d, planOptions.blocks)).dayLoad
  }
  for (const f of await forecastWeek(userId, weekKey, now)) {
    forecastLoads[f.date] = (forecastLoads[f.date] ?? 0) + intensityWeight(f.intensity)
  }

  return {
    dayKey,
    weekStart: weekKey,
    removedPlaceholders,
    returnedToQueue,
    removedFutureLeftovers: leftovers.deletedCount ?? 0,
    scheduled: actions.length,
    load: dayLoad,
    maxDailyIntensity: planOptions.maxDailyIntensity,
    forecastLoads,
  }
}

/**
 * Scheduler: make sure every recently active user's day is committed (each in their own
 * timezone). Users who haven't opened the app for a while are skipped; their day is
 * generated the moment they come back.
 */
export async function generateForActiveUsers(withinDays = 45, concurrency = 5) {
  const since = new Date(Date.now() - withinDays * 86_400_000)
  const users = await User.find({ status: 'active', lastSeenAt: { $gt: since } }, { _id: 1 })
  let generated = 0
  for (let i = 0; i < users.length; i += concurrency) {
    await Promise.all(users.slice(i, i + concurrency).map(async u => {
      try {
        const r = await ensureTodayGenerated(String(u._id))
        if (r.generated) generated++
      } catch (error) {
        console.error('Daily generation failed for a user:', error instanceof Error ? error.message : error)
      }
    }))
  }
  return { users: users.length, generated }
}
