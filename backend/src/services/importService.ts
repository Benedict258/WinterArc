import { z } from 'zod'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'
import { markNotificationsDirty } from './notificationService'
import { getUserBlocks } from './dayBlocksService'
import { getPlan } from './planService'
import { assertThreadRoom, PlanLimitError } from './threadService'
import { resolveBlock, UNSCHEDULED } from '../../../src/shared/dayBlocks'

export class ImportError extends Error {}

const MAX_TASKS = () => Number(process.env.MAX_TASKS_PER_USER) || 20_000
const MAX_NEW_THREADS = 30

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
const nullableDay = dayKey.nullable().optional()

export const importRowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: nullableDay,
  dueDate: nullableDay,
  status: z.enum(['pending', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  intensity: z.enum(['light', 'medium', 'heavy']).optional(),
  thread: z.string().trim().max(100).nullable().optional(),
})
export const importTasksSchema = z.object({
  rows: z.array(z.any()).min(1).max(2000),
  createThreads: z.boolean(),
  dryRun: z.boolean().optional(),
})

export type ImportSummary = {
  created: number
  duplicates: number
  invalid: number
  threadsCreated: number
  goalsCreated?: number
  wishlistCreated?: number
  /** thread names that would be (or were) created */
  newThreads: string[]
}

const asDate = (k?: string | null) => (k ? new Date(`${k}T00:00:00.000Z`) : null)
const taskKey = (title: string, date?: string | null, due?: string | null, threadId?: string | null) =>
  `${title.trim().toLowerCase()}|${date ?? ''}|${due ?? ''}|${threadId ?? ''}`
const dayOf = (d: unknown) => (d ? new Date(d as Date).toISOString().slice(0, 10) : null)

async function existingTaskKeys(userId: string, titles: string[]) {
  const keys = new Set<string>()
  const unique = [...new Set(titles)]
  for (let i = 0; i < unique.length; i += 500) {
    const found = await Task.find({ userId, title: { $in: unique.slice(i, i + 500) } }, { title: 1, date: 1, dueDate: 1, threadId: 1 })
    for (const t of found) keys.add(taskKey(t.title, dayOf(t.date), dayOf(t.dueDate), t.threadId ? String(t.threadId) : null))
  }
  return keys
}

async function assertRoom(userId: string, adding: number) {
  const have = await Task.countDocuments({ userId })
  if (have + adding > MAX_TASKS()) throw new ImportError(`That would take you over ${MAX_TASKS().toLocaleString()} tasks. Import fewer, or clear some out first.`)
}

/** Match thread names to the person's threads; make the missing ones when allowed. */
async function resolveThreads(userId: string, names: (string | null | undefined)[], create: boolean, dryRun: boolean) {
  const existing = await Thread.find({ userId, status: { $ne: 'archived' } }, { name: 1 })
  const byName = new Map(existing.map(t => [t.name.trim().toLowerCase(), String(t._id)]))
  const missing = new Map<string, string>() // lowercase → display name
  for (const n of names) {
    const name = n?.trim()
    if (name && !byName.has(name.toLowerCase()) && !missing.has(name.toLowerCase())) missing.set(name.toLowerCase(), name)
  }
  const { limits } = await getPlan(userId)
  const room = Math.max(0, limits.maxThreads - (await Thread.countDocuments({ userId, status: { $ne: 'archived' } })))
  // threads beyond the plan's room are not created; their tasks go in without a thread
  const make = create ? [...missing.values()].slice(0, Math.min(MAX_NEW_THREADS, room)) : []
  if (!dryRun) {
    for (const name of make) {
      const t = await Thread.create({ userId, name, category: 'Other', frequency: 'weekly', taskMode: 'discrete', priority: 'medium', intensity: 'medium' })
      byName.set(name.toLowerCase(), String(t._id))
    }
  }
  return { byName, newThreads: make }
}

/** Import rows produced from CSV, Todoist or Notion files. Every row is validated again here. */
export async function importTasks(userId: string, input: { rows: unknown[]; createThreads: boolean; dryRun?: boolean }): Promise<ImportSummary> {
  const valid: z.infer<typeof importRowSchema>[] = []
  let invalid = 0
  for (const raw of input.rows) {
    const parsed = importRowSchema.safeParse(raw)
    if (parsed.success) valid.push(parsed.data)
    else invalid++
  }
  const { byName, newThreads } = await resolveThreads(userId, valid.map(r => r.thread), input.createThreads, !!input.dryRun)
  const threadOf = (name?: string | null) => (name ? byName.get(name.trim().toLowerCase()) ?? null : null)

  const seen = await existingTaskKeys(userId, valid.map(r => r.title))
  const fresh: typeof valid = []
  let duplicates = 0
  for (const r of valid) {
    // in a dry run threads that don't exist yet can't be keyed, so a row for a brand-new thread is never a duplicate
    const k = taskKey(r.title, r.date, r.dueDate, threadOf(r.thread))
    if (seen.has(k)) { duplicates++; continue }
    seen.add(k)
    fresh.push(r)
  }

  await assertRoom(userId, fresh.length)
  const summary: ImportSummary = { created: fresh.length, duplicates, invalid, threadsCreated: input.dryRun ? 0 : newThreads.length, newThreads }
  if (input.dryRun || !fresh.length) return summary

  const now = new Date()
  const docs = fresh.map(r => ({
    userId, title: r.title, threadId: threadOf(r.thread), date: asDate(r.date), dueDate: asDate(r.dueDate),
    status: r.status ?? 'pending', ...(r.status === 'done' ? { completedAt: now } : {}),
    priority: r.priority ?? 'medium', intensity: r.intensity ?? 'medium', timeBlock: UNSCHEDULED, source: 'import',
  }))
  for (let i = 0; i < docs.length; i += 500) await Task.insertMany(docs.slice(i, i + 500))
  await markNotificationsDirty(userId)
  return summary
}

// ------------------------------------------------------- WinterArc export

const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)

export const winterArcExportSchema = z.object({
  threads: z.array(z.any()).max(500).optional(),
  tasks: z.array(z.any()).max(20_000).optional(),
  goals: z.array(z.any()).max(1000).optional(),
  wishlist: z.array(z.any()).max(5000).optional(),
}).passthrough()

/**
 * Bring a WinterArc export file into an account (for example from the original app).
 * Threads are matched by name (or created); tasks, goals and wishlist items already present are skipped, so
 * importing the same file twice adds nothing. Calendar links and auto-generated placeholders are left out.
 */
export async function importWinterArc(userId: string, data: z.infer<typeof winterArcExportSchema>, dryRun = false): Promise<ImportSummary> {
  const threads = (data.threads ?? []).filter((t: any) => t && str(t.name, 100))
  const existing = await Thread.find({ userId }, { name: 1 })
  const idByName = new Map(existing.map(t => [t.name.trim().toLowerCase(), String(t._id)]))
  const idByOld = new Map<string, string>()
  const newThreads: string[] = []
  const unknown = new Set(threads.map((t: any) => str(t.name, 100).toLowerCase()).filter(n => !idByName.has(n)))
  if (!dryRun) {
    try { await assertThreadRoom(userId, unknown.size) } catch (e) { throw e instanceof PlanLimitError ? new ImportError(e.message) : e }
  }
  for (const t of threads) {
    const name = str(t.name, 100)
    const known = idByName.get(name.toLowerCase())
    if (known) { if (t._id) idByOld.set(String(t._id), known); continue }
    newThreads.push(name)
    if (dryRun) continue
    const doc = await Thread.create({
      userId, name,
      category: oneOf(t.category, ['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other'] as const, 'Other'),
      frequency: oneOf(t.frequency, ['daily', 'multiple', 'weekly', 'fixed-day'] as const, 'weekly'),
      fixedDay: Number.isInteger(t.fixedDay) && t.fixedDay >= 0 && t.fixedDay <= 6 ? t.fixedDay : undefined,
      status: oneOf(t.status, ['active', 'parked', 'archived'] as const, 'active'),
      priority: oneOf(t.priority, ['low', 'medium', 'high'] as const, 'medium'),
      intensity: oneOf(t.intensity, ['light', 'medium', 'heavy'] as const, 'medium'),
      taskMode: oneOf(t.taskMode, ['discrete', 'continuous', 'event'] as const, 'continuous'),
      eventStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.eventStart ?? '') ? t.eventStart : null,
      eventEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.eventEnd ?? '') ? t.eventEnd : null,
      eventDays: Array.isArray(t.eventDays) ? t.eventDays.filter((d: unknown) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6).slice(0, 7) : [],
      notes: str(t.notes, 2000) || undefined,
    })
    idByName.set(name.toLowerCase(), String(doc._id))
    if (t._id) idByOld.set(String(t._id), String(doc._id))
  }

  const blocks = await getUserBlocks(userId)
  const tasks = (data.tasks ?? []).filter((t: any) => t && str(t.title, 200) && !(t.source === 'auto-generated' && t.status !== 'done'))
  const seen = await existingTaskKeys(userId, tasks.map((t: any) => str(t.title, 200)))
  const docs: Record<string, unknown>[] = []
  let duplicates = 0
  for (const t of tasks) {
    const title = str(t.title, 200)
    const threadId = t.threadId ? idByOld.get(String(t.threadId)) ?? null : null
    const date = day(t.date), due = day(t.dueDate)
    const k = taskKey(title, date, due, threadId)
    if (seen.has(k)) { duplicates++; continue }
    seen.add(k)
    const isEvent = !!t.isEvent && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.startTime ?? '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.endTime ?? '')
    docs.push({
      userId, title, threadId, date: asDate(date), dueDate: asDate(due),
      timeBlock: resolveBlock(typeof t.timeBlock === 'string' ? t.timeBlock : UNSCHEDULED, blocks),
      status: oneOf(t.status, ['pending', 'done', 'skipped'] as const, 'pending'),
      ...(t.status === 'done' ? { completedAt: Number.isNaN(Date.parse(t.completedAt)) ? new Date() : new Date(t.completedAt) } : {}),
      priority: oneOf(t.priority, ['low', 'medium', 'high'] as const, 'medium'),
      intensity: oneOf(t.intensity, ['light', 'medium', 'heavy'] as const, 'medium'),
      ...(isEvent ? { isEvent: true, startTime: t.startTime, endTime: t.endTime } : {}),
      source: 'import',
    })
  }

  const goals = (data.goals ?? []).filter((g: any) => str(g?.period, 20) && str(g?.text, 500))
  const haveGoals = new Set((await Goal.find({ userId }, { period: 1, text: 1 })).map(g => `${g.period}|${g.text}`))
  const newGoals = goals.filter((g: any) => !haveGoals.has(`${str(g.period, 20)}|${str(g.text, 500)}`))
  const wishes = (data.wishlist ?? []).filter((w: any) => str(w?.item, 200))
  const haveWishes = new Set((await WishlistItem.find({ userId }, { item: 1 })).map(w => w.item))
  const newWishes = wishes.filter((w: any) => !haveWishes.has(str(w.item, 200)))

  await assertRoom(userId, docs.length)
  const summary: ImportSummary = { created: docs.length, duplicates, invalid: 0, threadsCreated: dryRun ? 0 : newThreads.length, goalsCreated: newGoals.length, wishlistCreated: newWishes.length, newThreads }
  if (dryRun) return summary
  for (let i = 0; i < docs.length; i += 500) await Task.insertMany(docs.slice(i, i + 500))
  for (const g of newGoals) await Goal.create({ userId, period: str(g.period, 20), text: str(g.text, 500) })
  for (const w of newWishes) await WishlistItem.create({ userId, item: str(w.item, 200), note: str(w.note, 1000) || undefined, acquired: !!w.acquired })
  await markNotificationsDirty(userId)
  return summary
}
