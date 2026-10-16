// The changes the assistant can suggest. Each has an argument schema, a plain-language
// description for the approval card, and an executor that runs only after the person approves.
import { z } from 'zod'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'
import { createThread, updateThread } from './threadService'
import { createTask, updateTask, deleteTask } from './taskService'
import { updateSettings } from './settingsService'
import { rebalanceWeek } from './dailyGenerationService'
import { blocksProblem } from '../../../src/shared/dayBlocks'
import { settingsSchema } from '../utils/validation'
import { Habit } from '../models/Habit'
import { archiveHabit, createHabit } from './habitService'
import { habitProblem } from '../../../src/shared/habits'

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id')
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const priority = z.enum(['low', 'medium', 'high'])
const intensity = z.enum(['light', 'medium', 'heavy'])
const blockId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/)
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const taskFields = {
  title: z.string().trim().min(1).max(200),
  date: dayKey.nullable().optional(),
  dueDate: dayKey.nullable().optional(),
  timeBlock: blockId.optional(),
  intensity: intensity.optional(),
  priority: priority.optional(),
}

export const ACTION_SCHEMAS = {
  create_thread: z.object({
    name: z.string().trim().min(1).max(100),
    category: z.enum(['Role/Program', 'Active Build', 'Learning Track', 'Application/Outreach', 'Other']).optional(),
    frequency: z.enum(['daily', 'multiple', 'weekly', 'fixed-day']),
    fixedDay: z.number().int().min(0).max(6).optional(),
    priority: priority.optional(),
    intensity: intensity.optional(),
    taskMode: z.enum(['discrete', 'continuous', 'event']).optional(),
    eventStart: clock.optional(),
    eventEnd: clock.optional(),
    eventDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    notes: z.string().max(2000).optional(),
  }),
  update_thread: z.object({
    threadId: objectId,
    changes: z.object({
      name: z.string().trim().min(1).max(100).optional(),
      frequency: z.enum(['daily', 'multiple', 'weekly', 'fixed-day']).optional(),
      fixedDay: z.number().int().min(0).max(6).nullable().optional(),
      priority: priority.optional(),
      intensity: intensity.optional(),
      status: z.enum(['active', 'parked', 'archived']).optional(),
      notes: z.string().max(2000).optional(),
    }).refine(c => Object.keys(c).length > 0, 'No changes given'),
  }),
  create_tasks: z.object({
    tasks: z.array(z.object({ ...taskFields, thread: z.string().trim().max(100).optional() })).min(1).max(30),
  }),
  update_task: z.object({
    taskId: objectId,
    changes: z.object({
      title: taskFields.title.optional(),
      date: taskFields.date,
      dueDate: taskFields.dueDate,
      timeBlock: z.union([blockId, z.literal('unscheduled')]).optional(),
      status: z.enum(['pending', 'done', 'skipped']).optional(),
      intensity: taskFields.intensity,
      priority: taskFields.priority,
    }).refine(c => Object.keys(c).length > 0, 'No changes given'),
  }),
  delete_task: z.object({ taskId: objectId }),
  add_goal: z.object({ period: z.string().trim().min(1).max(20), text: z.string().trim().min(1).max(500) }),
  add_wishlist_item: z.object({ item: z.string().trim().min(1).max(200), note: z.string().max(1000).optional() }),
  update_settings: settingsSchema.pick({ timezone: true, multipleThreadsPerWeekTarget: true, gridBalancing: true, planner: true, appearance: true, modules: true, focus: true, fitness: true, nutrition: true }).partial()
    .refine(s => Object.keys(s).length > 0, 'No changes given'),
  rebalance_week: z.object({}),
  create_habit: z.object({
    name: z.string().trim().min(1).max(60),
    emoji: z.string().max(8).optional(),
    unit: z.string().trim().max(16).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    target: z.number().int().min(1).max(1000).optional(),
  }),
  archive_habit: z.object({ habitId: objectId }),
} as const

export type ActionKind = keyof typeof ACTION_SCHEMAS

export const isActionKind = (k: string): k is ActionKind => k in ACTION_SCHEMAS

export const DESTRUCTIVE: ActionKind[] = ['delete_task']

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Look up titles so the approval card can say "Delete 'Write report'" instead of an id. */
async function taskTitle(userId: string, id: string) {
  const t = await Task.findOne({ _id: id, userId }, { title: 1 })
  return t?.title ?? null
}
async function threadName(userId: string, id: string) {
  const t = await Thread.findOne({ _id: id, userId }, { name: 1 })
  return t?.name ?? null
}

export class ActionError extends Error {}

/** Models can't send null in every tool schema, so "none" (or empty) means "clear this field". */
function normalizeNone(kind: ActionKind, raw: any) {
  if (kind !== 'update_task' || !raw?.changes || typeof raw.changes !== 'object') return raw
  const changes = { ...raw.changes }
  for (const k of ['date', 'dueDate']) {
    if (typeof changes[k] === 'string' && ['none', 'null', ''].includes(changes[k].trim().toLowerCase())) changes[k] = null
  }
  return { ...raw, changes }
}

/** Validate arguments and describe the change for the person. Throws ActionError with a message the model can act on. */
export async function describeAction(userId: string, kind: ActionKind, raw: unknown): Promise<{ args: any; summary: string; details: string[] }> {
  const parsed = ACTION_SCHEMAS[kind].safeParse(normalizeNone(kind, raw))
  if (!parsed.success) throw new ActionError(parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '))
  const a: any = parsed.data
  switch (kind) {
    case 'create_thread':
      return { args: a, summary: `Create thread “${a.name}”`, details: [`${a.frequency}${a.fixedDay !== undefined ? ` on ${DAY[a.fixedDay]}` : ''}`, `${a.intensity ?? 'medium'} intensity · ${a.priority ?? 'medium'} priority`] }
    case 'update_thread': {
      const name = await threadName(userId, a.threadId)
      if (!name) throw new ActionError('That thread doesn’t exist.')
      return { args: a, summary: `Change thread “${name}”`, details: Object.entries(a.changes).map(([k, v]) => `${k} → ${v}`) }
    }
    case 'create_tasks':
      return { args: a, summary: `Add ${a.tasks.length} task${a.tasks.length === 1 ? '' : 's'}`, details: a.tasks.map((t: any) => [t.title, t.thread && `in ${t.thread}`, t.date && `on ${t.date}`, t.dueDate && `due ${t.dueDate}`].filter(Boolean).join(' · ')) }
    case 'update_task': {
      const title = await taskTitle(userId, a.taskId)
      if (!title) throw new ActionError('That task doesn’t exist.')
      return { args: a, summary: `Change task “${title}”`, details: Object.entries(a.changes).map(([k, v]) => `${k} → ${v === null ? 'none' : v}`) }
    }
    case 'delete_task': {
      const title = await taskTitle(userId, a.taskId)
      if (!title) throw new ActionError('That task doesn’t exist.')
      return { args: a, summary: `Delete task “${title}”`, details: ['This can’t be undone.'] }
    }
    case 'add_goal':
      return { args: a, summary: `Add goal for ${a.period}`, details: [a.text] }
    case 'add_wishlist_item':
      return { args: a, summary: `Add “${a.item}” to your wishlist`, details: a.note ? [a.note] : [] }
    case 'update_settings': {
      if (a.planner?.blocks) {
        const problem = blocksProblem(a.planner.blocks)
        if (problem) throw new ActionError(problem)
      }
      const details = Object.entries(a).flatMap(([group, value]) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.entries(value as object).map(([k, v]) => `${group}.${k} → ${k === 'blocks' ? `${(v as any[]).length} blocks (${(v as any[]).map(b => b.label).join(', ')})` : v}`)
          : [`${group} → ${value}`])
      return { args: a, summary: 'Change your settings', details }
    }
    case 'rebalance_week':
      return { args: a, summary: 'Rebalance this week’s plan', details: ['Re-plans the days that haven’t happened yet.'] }
    case 'create_habit': {
      const weekdays = a.weekdays ?? [0, 1, 2, 3, 4, 5, 6]
      const problem = habitProblem({ ...a, weekdays, target: a.target ?? 1 })
      if (problem) throw new ActionError(problem)
      const days = weekdays.length === 7 ? 'every day' : weekdays.map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
      return { args: { ...a, weekdays }, summary: `Track habit “${a.name}”`, details: [days, `${a.target ?? 1}${a.unit ? ` ${a.unit}` : ''} a day`] }
    }
    case 'archive_habit': {
      const h = await Habit.findOne({ _id: a.habitId, userId, archived: false }, { name: 1 })
      if (!h) throw new ActionError('That habit doesn’t exist.')
      return { args: a, summary: `Stop tracking “${h.name}”`, details: ['Its history is kept; you can still see it in monthly averages.'] }
    }
  }
}

/** Run an approved change. Everything goes through the same services (and ownership checks) the app itself uses. */
export async function executeAction(userId: string, kind: ActionKind, args: any): Promise<string> {
  // Arguments were validated when proposed, but re-check: stored data is not trusted blindly
  const parsed = ACTION_SCHEMAS[kind].safeParse(args)
  if (!parsed.success) throw new ActionError('The suggestion is no longer valid.')
  const a: any = parsed.data
  switch (kind) {
    case 'create_thread': {
      const event = a.taskMode === 'event'
      await createThread(userId, { ...a, ...(event ? { frequency: 'weekly' } : {}) })
      return `Created thread “${a.name}”.`
    }
    case 'update_thread': {
      const t = await updateThread(userId, a.threadId, a.changes)
      if (!t) throw new ActionError('That thread no longer exists.')
      return `Updated “${t.name}”.`
    }
    case 'create_tasks': {
      const threads = await Thread.find({ userId, status: { $ne: 'archived' } }, { name: 1 })
      const byName = new Map(threads.map(t => [t.name.toLowerCase(), String(t._id)]))
      let missing = 0
      for (const t of a.tasks) {
        const { thread, ...fields } = t
        const threadId = thread ? (byName.get(thread.toLowerCase()) ?? null) : null
        if (thread && !threadId) missing++
        await createTask(userId, { ...fields, threadId, source: 'manual', status: 'pending', ...(fields.date ? {} : { date: null }) })
      }
      return `Added ${a.tasks.length} task${a.tasks.length === 1 ? '' : 's'}${missing ? ` (${missing} without a thread because it wasn’t found)` : ''}.`
    }
    case 'update_task': {
      const t = await updateTask(userId, a.taskId, { ...a.changes })
      if (!t) throw new ActionError('That task no longer exists.')
      return `Updated “${t.title}”.`
    }
    case 'delete_task': {
      const t = await deleteTask(userId, a.taskId)
      if (!t) throw new ActionError('That task no longer exists.')
      return `Deleted “${t.title}”.`
    }
    case 'add_goal':
      await Goal.create({ userId, period: a.period, text: a.text })
      return 'Goal added.'
    case 'add_wishlist_item':
      await WishlistItem.create({ userId, item: a.item, note: a.note })
      return 'Added to your wishlist.'
    case 'update_settings':
      await updateSettings(userId, a)
      return 'Settings updated.'
    case 'rebalance_week':
      await rebalanceWeek(userId)
      return 'Week rebalanced.'
    case 'create_habit': {
      const h = await createHabit(userId, { ...a, weekdays: a.weekdays ?? [0, 1, 2, 3, 4, 5, 6], target: a.target ?? 1 })
      return `Now tracking “${h.name}”.`
    }
    case 'archive_habit':
      await archiveHabit(userId, a.habitId)
      return 'Habit archived.'
  }
}
