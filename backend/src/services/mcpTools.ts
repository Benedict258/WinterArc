import { z } from 'zod'
import { Task } from '../models/Task'
import { Thread } from '../models/Thread'
import { Goal } from '../models/Goal'
import { WishlistItem } from '../models/WishlistItem'
import { Settings } from '../models/Settings'
import { createTask } from './taskService'
import { createThread, getThreads } from './threadService'
import { ACTION_SCHEMAS, executeAction } from './aiActions'
import { addDaysKey, dateToDayKey, dayKeyToDate, toDayKey, DEFAULT_TIMEZONE } from './dailyGenerationService'
import { applyRoutine, createRoutine, deleteRoutine, listRoutines, updateRoutine } from './routineService'
import { archiveHabit, checkIn, createHabit, listHabits, monthlyOverview, resolveHabit, updateHabit } from './habitService'
import { createWorkout, deleteWorkout, overview as fitnessOverview, saveMetric, setManualSteps } from './fitnessService'
import { createMeal, deleteMeal, overview as nutritionOverview } from './nutritionService'
import { getSummary as focusSummary, logSession } from './focusService'
import { updateSettings } from './settingsService'
import { MEAL_SLOTS } from '../../../src/shared/nutrition'
import { WORKOUT_KINDS } from '../../../src/shared/fitness'
import { settingsSchema } from '../utils/validation'

// The tools an AI app (Claude, ChatGPT, …) can use once a person connects it. Each one goes through the same
// services, validation and ownership checks as the app itself. Read tools need the read scope, the rest the write scope.
// There is deliberately nothing for account deletion, billing, sign-in, partners, shared threads or Drop.

export type Ctx = { userId: string; now: Date }
export type ToolDef = {
  name: string; title: string; description: string; scope: 'read' | 'write'
  /** MCP hints so the AI app can ask for confirmation sensibly */
  destructive?: boolean; idempotent?: boolean
  schema: z.ZodObject<any>
  run: (ctx: Ctx, args: any) => Promise<unknown>
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const id = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id')
const intensity = z.enum(['light', 'medium', 'heavy'])
const priority = z.enum(['low', 'medium', 'high'])

const clip = (s: unknown, n = 200) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
const taskShape = (t: any) => ({
  id: String(t._id), title: clip(t.title), date: t.date ? dateToDayKey(new Date(t.date)) : null, timeBlock: t.timeBlock, status: t.status,
  intensity: t.intensity, priority: t.priority, threadId: t.threadId ? String(t.threadId) : null, ...(t.dueDate ? { due: dateToDayKey(new Date(t.dueDate)) } : {}),
  ...(t.isEvent ? { event: { start: t.startTime, end: t.endTime } } : {}),
})
const todayOf = async (userId: string, now: Date) => toDayKey(now, (await Settings.findOne({ userId }, { timezone: 1 }))?.timezone || DEFAULT_TIMEZONE)
const act = (kind: keyof typeof ACTION_SCHEMAS) => async ({ userId }: Ctx, args: unknown) => ({ message: await executeAction(userId, kind, args) })

export const TOOLS: ToolDef[] = [
  // ------------------------------------------------------------------ read
  {
    name: 'get_today', title: 'Today at a glance', scope: 'read',
    description: 'Everything for a day in one call: tasks and events, habits with streaks, focus minutes, steps, workouts this week and calories eaten against goals. Defaults to today.',
    schema: z.object({ date: day.optional() }),
    run: async ({ userId, now }, a) => {
      const date = a.date ?? await todayOf(userId, now)
      const [tasks, habits, focus, fitness, nutrition] = await Promise.all([
        Task.find({ userId, date: dayKeyToDate(date) }).sort({ createdAt: 1 }).limit(200),
        listHabits(userId, now), focusSummary(userId, now), fitnessOverview(userId, 7, now), nutritionOverview(userId, 7, now),
      ])
      return {
        date, tasks: tasks.map(taskShape),
        habits: habits.habits.map(h => ({ id: h.id, name: h.name, dueToday: h.today.scheduled, done: h.today.done, value: h.today.value, target: h.target, unit: h.unit, streak: h.streak.current })),
        focus: { minutesToday: focus.todayMinutes, roundsToday: focus.todayRounds, streakDays: focus.streak },
        fitness: { stepsToday: fitness.todaySteps, stepGoal: fitness.prefs.stepGoal, workoutsThisWeek: fitness.week.count, weeklyGoal: fitness.week.goal },
        nutrition: { eaten: nutrition.eaten, goals: { calories: nutrition.goals.calories, proteinG: nutrition.goals.proteinG }, remaining: nutrition.remaining },
      }
    },
  },
  {
    name: 'list_tasks', title: 'List tasks', scope: 'read',
    description: 'Tasks scheduled between two days (inclusive), up to 200. Use list_backlog for tasks with no day.',
    schema: z.object({ from: day, to: day, status: z.enum(['pending', 'done', 'skipped']).optional(), limit: z.number().int().min(1).max(200).optional() }),
    run: async ({ userId }, a) => {
      const rows = await Task.find({ userId, date: { $gte: dayKeyToDate(a.from), $lt: dayKeyToDate(addDaysKey(a.to, 1)) }, ...(a.status ? { status: a.status } : {}) }).sort({ date: 1, createdAt: 1 }).limit(a.limit ?? 100)
      return { tasks: rows.map(taskShape) }
    },
  },
  {
    name: 'list_backlog', title: 'List the backlog', scope: 'read', description: 'Loose pending tasks that have no day yet.',
    schema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
    run: async ({ userId }, a) => ({ tasks: (await Task.find({ userId, date: null, status: 'pending' }).sort({ createdAt: -1 }).limit(a.limit ?? 50)).map(taskShape) }),
  },
  {
    name: 'list_threads', title: 'List threads', scope: 'read', description: 'Threads (ongoing areas of work) with their rhythm, priority and status.',
    schema: z.object({}),
    run: async ({ userId }) => ({
      threads: (await getThreads(userId)).map((t: any) => ({ id: String(t._id), name: clip(t.name, 100), category: t.category, frequency: t.frequency, fixedDay: t.fixedDay ?? null, status: t.status, priority: t.priority, intensity: t.intensity })),
    }),
  },
  {
    name: 'list_goals', title: 'List goals and wishlist', scope: 'read', description: 'Goals by period and wishlist items.',
    schema: z.object({}),
    run: async ({ userId }) => ({
      goals: (await Goal.find({ userId }).sort({ createdAt: -1 }).limit(50)).map(g => ({ id: String(g._id), period: g.period, text: clip(g.text, 300) })),
      wishlist: (await WishlistItem.find({ userId }).sort({ createdAt: -1 }).limit(50)).map(w => ({ id: String(w._id), item: clip(w.item), note: clip(w.note, 200), acquired: w.acquired })),
    }),
  },
  { name: 'list_routines', title: 'List routines', scope: 'read', description: 'Saved routines with their steps, weekdays and whether they add themselves.', schema: z.object({}), run: async ({ userId }) => ({ routines: await listRoutines(userId) }) },
  { name: 'list_habits', title: 'List habits', scope: 'read', description: 'Habits with today’s progress, streaks, the last 14 days and recent completion rates.', schema: z.object({}), run: async ({ userId, now }) => await listHabits(userId, now) },
  { name: 'habit_stats', title: 'Habit statistics', scope: 'read', description: 'Month-by-month completion rates (last 6 months) overall and per habit.', schema: z.object({}), run: async ({ userId, now }) => await monthlyOverview(userId, now) },
  {
    name: 'fitness_summary', title: 'Fitness summary', scope: 'read',
    description: 'Steps (today, goal, daily history), this week’s workouts, recent workouts, personal bests and body measurement trends. Weights are in kg, distances in km.',
    schema: z.object({ days: z.number().int().min(7).max(90).optional() }),
    run: async ({ userId, now }, a) => {
      const o = await fitnessOverview(userId, a.days ?? 14, now)
      return { today: o.today, goals: { stepGoal: o.prefs.stepGoal, weeklyWorkouts: o.prefs.weeklyWorkouts, units: o.prefs.units }, todaySteps: o.todaySteps, steps: o.steps.map(s => ({ day: s.day, steps: s.steps })), stepStats: o.stepStats, week: o.week, workouts: o.workouts.slice(0, 20), bests: o.bests.slice(0, 20), metrics: o.metrics.slice(-30), weightChange30Days: o.weightChange30 }
    },
  },
  {
    name: 'nutrition_summary', title: 'Nutrition summary', scope: 'read',
    description: 'Today’s meals and totals against goals, what is left, daily totals for recent days, and the person’s diet notes and foods to avoid. Numbers are estimates.',
    schema: z.object({ days: z.number().int().min(7).max(60).optional() }),
    run: async ({ userId, now }, a) => {
      const o = await nutritionOverview(userId, a.days ?? 14, now)
      return { today: o.today, goals: o.goals, eaten: o.eaten, remaining: o.remaining, meals: o.todayMeals, days: o.days, averageOnLoggedDays: o.average, loggingStreakDays: o.streak, recentMeals: o.recent.map(m => ({ text: m.text, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG })) }
    },
  },
  { name: 'focus_summary', title: 'Focus summary', scope: 'read', description: 'Pomodoro focus time: today, the last 7 days, the streak and recent rounds.', schema: z.object({}), run: async ({ userId, now }) => await focusSummary(userId, now) },
  {
    name: 'get_settings', title: 'Get settings', scope: 'read', description: 'Time zone, day blocks and planner rules, and the focus, fitness and nutrition goals.',
    schema: z.object({}),
    run: async ({ userId }) => {
      const s = await Settings.findOne({ userId })
      const plain = (v: any) => v?.toObject?.() ?? v ?? null
      return { timezone: s?.timezone ?? DEFAULT_TIMEZONE, planner: plain(s?.planner), gridBalancing: plain(s?.gridBalancing), focus: plain(s?.focus), fitness: plain(s?.fitness), nutrition: plain(s?.nutrition), modules: plain(s?.modules) }
    },
  },

  // ----------------------------------------------------------------- write
  {
    name: 'create_tasks', title: 'Add tasks', scope: 'write',
    description: 'Add one or more tasks. Leave date out to put a task in the backlog. thread is the name of an existing thread. Returns the new task ids.',
    schema: ACTION_SCHEMAS.create_tasks,
    run: async ({ userId }, a) => {
      const threads = await Thread.find({ userId, status: { $ne: 'archived' } }, { name: 1 })
      const byName = new Map(threads.map(t => [t.name.toLowerCase(), String(t._id)]))
      const created: unknown[] = []
      for (const t of a.tasks) {
        const { thread, ...fields } = t
        const threadId = thread ? (byName.get(String(thread).toLowerCase()) ?? null) : null
        const doc: any = await createTask(userId, { ...fields, threadId, source: 'manual', status: 'pending', ...(fields.date ? {} : { date: null }) })
        created.push({ ...taskShape(doc), ...(thread && !threadId ? { note: `Thread “${thread}” wasn’t found, so it has no thread.` } : {}) })
      }
      return { created }
    },
  },
  { name: 'update_task', title: 'Change a task', scope: 'write', description: 'Rename, move to another day or block, mark done or skipped, or change due date, intensity or priority. date "none" sends it back to the backlog.', schema: ACTION_SCHEMAS.update_task, idempotent: true, run: act('update_task') },
  { name: 'delete_task', title: 'Delete a task', scope: 'write', description: 'Delete a task permanently. Only when the person asked for it.', schema: ACTION_SCHEMAS.delete_task, destructive: true, idempotent: true, run: act('delete_task') },
  {
    name: 'create_thread', title: 'Create a thread', scope: 'write', description: 'Create a thread (an ongoing area of work with a weekly rhythm).',
    schema: ACTION_SCHEMAS.create_thread,
    run: async ({ userId }, a) => {
      const event = a.taskMode === 'event'
      const t: any = await createThread(userId, { ...a, ...(event ? { frequency: 'weekly' } : {}) })
      return { id: String(t._id), name: t.name }
    },
  },
  { name: 'update_thread', title: 'Change a thread', scope: 'write', description: 'Change a thread’s name, rhythm, priority, intensity or status (active, parked, archived).', schema: ACTION_SCHEMAS.update_thread, idempotent: true, run: act('update_thread') },
  { name: 'add_goal', title: 'Add a goal', scope: 'write', description: 'Add a goal for a period such as Q4-2026.', schema: ACTION_SCHEMAS.add_goal, run: act('add_goal') },
  { name: 'add_wishlist_item', title: 'Add to the wishlist', scope: 'write', description: 'Add an item to the wishlist.', schema: ACTION_SCHEMAS.add_wishlist_item, run: act('add_wishlist_item') },
  { name: 'rebalance_week', title: 'Re-plan the week', scope: 'write', description: 'Re-plan the days of this week that haven’t happened yet.', schema: ACTION_SCHEMAS.rebalance_week, idempotent: true, run: act('rebalance_week') },
  {
    name: 'update_settings', title: 'Change settings', scope: 'write',
    description: 'Change planner rules and day blocks (planner), the daily intensity cap (gridBalancing), or focus timer, fitness and nutrition goals. Not time zone, appearance or which features are on.',
    schema: z.object({ planner: settingsSchema.shape.planner, gridBalancing: settingsSchema.shape.gridBalancing, focus: settingsSchema.shape.focus, fitness: settingsSchema.shape.fitness, nutrition: settingsSchema.shape.nutrition }).partial()
      .refine(s => Object.keys(s).length > 0, 'No changes given'),
    idempotent: true,
    run: async ({ userId }, a) => { await updateSettings(userId, a); return { message: 'Settings updated.' } },
  },
  {
    name: 'create_routine', title: 'Create a routine', scope: 'write',
    description: 'Create a routine: a named list of steps (each with an optional start time HH:mm, minutes and intensity), the weekdays it runs (0 = Sunday … 6 = Saturday) and whether it adds itself to those days.',
    schema: z.object({
      name: z.string().max(60), weekdays: z.array(z.number().int().min(0).max(6)).max(7), autoAdd: z.boolean().optional(),
      items: z.array(z.object({ title: z.string().max(120), startTime: z.string().nullable().optional(), minutes: z.number().int().nullable().optional(), intensity: intensity.optional() })).min(1).max(30),
    }),
    run: async ({ userId }, a) => await createRoutine(userId, {
      name: a.name, weekdays: a.weekdays, autoAdd: a.autoAdd ?? false,
      items: a.items.map((i: any, n: number) => ({ id: `s${n}${Math.random().toString(36).slice(2, 6)}`, title: i.title, startTime: i.startTime ?? null, minutes: i.minutes ?? null, intensity: i.intensity ?? 'light' })),
    }),
  },
  {
    name: 'update_routine', title: 'Replace a routine', scope: 'write', idempotent: true,
    description: 'Replace a routine with a new version (send the full routine: name, weekdays, autoAdd and all steps).',
    schema: z.object({
      routineId: id, name: z.string().max(60), weekdays: z.array(z.number().int().min(0).max(6)).max(7), autoAdd: z.boolean().optional(),
      items: z.array(z.object({ title: z.string().max(120), startTime: z.string().nullable().optional(), minutes: z.number().int().nullable().optional(), intensity: intensity.optional() })).min(1).max(30),
    }),
    run: async ({ userId }, a) => await updateRoutine(userId, a.routineId, {
      name: a.name, weekdays: a.weekdays, autoAdd: a.autoAdd ?? false,
      items: a.items.map((i: any, n: number) => ({ id: `s${n}${Math.random().toString(36).slice(2, 6)}`, title: i.title, startTime: i.startTime ?? null, minutes: i.minutes ?? null, intensity: i.intensity ?? 'light' })),
    }),
  },
  { name: 'delete_routine', title: 'Delete a routine', scope: 'write', description: 'Delete a routine. Tasks it already added stay.', schema: z.object({ routineId: id }), destructive: true, idempotent: true, run: async ({ userId }, a) => await deleteRoutine(userId, a.routineId) },
  { name: 'apply_routine', title: 'Add a routine to a day', scope: 'write', description: 'Add a routine’s steps to a day as tasks (steps already added are skipped).', schema: z.object({ routineId: id, date: day }), idempotent: true, run: async ({ userId }, a) => await applyRoutine(userId, a.routineId, a.date) },
  {
    name: 'create_habit', title: 'Create a habit', scope: 'write', description: 'Start tracking a habit. target is how many counts make a day done (1 for yes/no, 8 for eight glasses). weekdays default to every day (0 = Sunday … 6 = Saturday).',
    schema: z.object({ name: z.string().max(60), emoji: z.string().max(8).optional(), unit: z.string().max(16).optional(), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(), target: z.number().int().min(1).max(1000).optional() }),
    run: async ({ userId, now }, a) => await createHabit(userId, { ...a, weekdays: a.weekdays ?? [0, 1, 2, 3, 4, 5, 6], target: a.target ?? 1 }, now),
  },
  {
    name: 'update_habit', title: 'Change a habit', scope: 'write', idempotent: true, description: 'Replace a habit’s settings (send name, weekdays and target; emoji and unit optional).',
    schema: z.object({ habitId: id, name: z.string().max(60), emoji: z.string().max(8).optional(), unit: z.string().max(16).optional(), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), target: z.number().int().min(1).max(1000) }),
    run: async ({ userId, now }, { habitId, ...rest }) => await updateHabit(userId, habitId, rest, now),
  },
  { name: 'archive_habit', title: 'Archive a habit', scope: 'write', description: 'Stop tracking a habit; its history is kept.', schema: z.object({ habitId: id }), idempotent: true, run: async ({ userId }, a) => await archiveHabit(userId, a.habitId) },
  {
    name: 'log_habit', title: 'Log a habit', scope: 'write', idempotent: false,
    description: 'Record progress on a habit for a day (default today). Send value to set the amount done that day, or add to add to it. value 0 clears the day. Returns the new streak.',
    schema: z.object({ habit: z.string().max(80).describe('Habit id or name'), value: z.number().min(0).max(100000).optional(), add: z.number().min(-100000).max(100000).optional(), day: day.optional() })
      .refine(a => (a.value === undefined) !== (a.add === undefined), 'Send either value or add'),
    run: async ({ userId, now }, a) => {
      const found = await resolveHabit(userId, a.habit, now)
      if ('error' in found) throw new ToolInputError(found.error)
      const r = await checkIn(userId, found.habit.id, { ...(a.day ? { day: a.day } : {}), ...(a.value !== undefined ? { value: a.value } : { add: a.add }) }, now)
      return { habit: r.name, today: r.today, streak: r.streak, milestone: r.milestone }
    },
  },
  {
    name: 'log_workout', title: 'Log a workout', scope: 'write',
    description: 'Record a workout that already happened. Use kilograms and kilometres. Strength workouts list exercises with sets; cardio just needs minutes and/or km. Returns the workout id.',
    schema: z.object({
      title: z.string().max(80), kind: z.enum(WORKOUT_KINDS), day: day.optional(), minutes: z.number().int().min(1).max(1440).nullable().optional(), km: z.number().min(0).max(1000).nullable().optional(),
      calories: z.number().int().min(0).max(20000).nullable().optional(), effort: z.number().int().min(1).max(10).nullable().optional(), notes: z.string().max(2000).optional(),
      exercises: z.array(z.object({ name: z.string().max(60), sets: z.array(z.object({ reps: z.number().int().min(0).max(1000).nullable().optional(), weightKg: z.number().min(0).max(1000).nullable().optional(), seconds: z.number().int().min(0).max(86400).nullable().optional(), km: z.number().min(0).max(1000).nullable().optional() })).max(20) })).max(30).optional(),
    }),
    run: async ({ userId, now }, a) => await createWorkout(userId, {
      day: a.day ?? await todayOf(userId, now), title: a.title, kind: a.kind, minutes: a.minutes ?? null, km: a.km ?? null, calories: a.calories ?? null, effort: a.effort ?? null, notes: a.notes ?? '',
      exercises: (a.exercises ?? []).map((e: any) => ({ name: e.name, sets: e.sets.map((s: any) => ({ reps: s.reps ?? null, weightKg: s.weightKg ?? null, seconds: s.seconds ?? null, km: s.km ?? null })) })),
    }, 'assistant', now),
  },
  { name: 'delete_workout', title: 'Delete a workout', scope: 'write', description: 'Delete a logged workout.', schema: z.object({ workoutId: id }), destructive: true, idempotent: true, run: async ({ userId }, a) => await deleteWorkout(userId, a.workoutId) },
  { name: 'log_steps', title: 'Set steps for a day', scope: 'write', description: 'Set the number of steps for a day (default today). A count from the person’s phone or watch takes precedence.', schema: z.object({ steps: z.number().int().min(0).max(150000), day: day.optional() }), idempotent: true, run: async ({ userId, now }, a) => await setManualSteps(userId, a.day ?? await todayOf(userId, now), a.steps, now) },
  {
    name: 'log_body_metric', title: 'Record body measurements', scope: 'write', idempotent: true, description: 'Record measurements for a day (default today): weightKg, sleepHours, restingHr, waistCm (cm), mood (1-5). Only send what the person gave.',
    schema: z.object({ day: day.optional(), weightKg: z.number().optional(), sleepHours: z.number().optional(), restingHr: z.number().int().optional(), waistCm: z.number().optional(), mood: z.number().int().min(1).max(5).optional() }),
    run: async ({ userId, now }, { day: d, ...fields }) => await saveMetric(userId, d ?? await todayOf(userId, now), fields, now),
  },
  {
    name: 'log_meal', title: 'Log a meal', scope: 'write',
    description: 'Record a meal the person ate with estimated calories and macros for the whole meal (grams of protein, carbs, fat). Say these are estimates. Returns the meal id.',
    schema: z.object({
      slot: z.enum(MEAL_SLOTS), text: z.string().max(300), calories: z.number().min(0).max(10000), proteinG: z.number().min(0).max(1000), carbsG: z.number().min(0).max(2000), fatG: z.number().min(0).max(1000),
      day: day.optional(), items: z.array(z.object({ name: z.string().max(80), calories: z.number().min(0).max(10000), proteinG: z.number().min(0).max(1000), carbsG: z.number().min(0).max(2000), fatG: z.number().min(0).max(1000) })).max(20).optional(),
    }),
    run: async ({ userId, now }, a) => await createMeal(userId, { ...a, day: a.day ?? await todayOf(userId, now), items: a.items ?? [] }, 'assistant', now),
  },
  { name: 'delete_meal', title: 'Delete a meal', scope: 'write', description: 'Delete a logged meal.', schema: z.object({ mealId: id }), destructive: true, idempotent: true, run: async ({ userId }, a) => await deleteMeal(userId, a.mealId) },
  {
    name: 'log_focus_session', title: 'Log a focus session', scope: 'write', description: 'Record a finished focus (Pomodoro) round of 1-180 minutes that started at startedAt (ISO time; default: that many minutes ago).',
    schema: z.object({ minutes: z.number().int().min(1).max(180), label: z.string().max(80).optional(), startedAt: z.string().max(40).optional() }),
    run: async ({ userId, now }, a) => await logSession(userId, { startedAt: a.startedAt ?? new Date(now.getTime() - a.minutes * 60_000).toISOString(), minutes: a.minutes, label: a.label }),
  },
]

/** A mistake in what the AI app sent (not a bug): reported back so it can correct itself. */
export class ToolInputError extends Error {}
