import { Routine } from '../models/Routine'
import { Task } from '../models/Task'
import { MAX_ROUTINES, normalizeRoutine, type RoutineItem, routineKey, routineProblem, routineRunsOn, addMinutes, type RoutineInput } from '../../../src/shared/routines'
import { blockForTime, type DayBlock } from '../../../src/shared/dayBlocks'
import { getUserBlocks } from './dayBlocksService'

export class RoutineError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const dateOf = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`)
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

type RoutineJson = RoutineInput & { id: string }
const toJson = (r: any): RoutineJson => ({
  id: String(r._id), name: r.name, weekdays: r.weekdays, autoAdd: r.autoAdd,
  items: r.items.map((i: any) => ({ id: i.id, title: i.title, startTime: i.startTime ?? null, minutes: i.minutes ?? null, intensity: i.intensity })),
})

export async function listRoutines(userId: string) {
  return (await Routine.find({ userId }).sort({ createdAt: 1 })).map(toJson)
}

function check(input: unknown): RoutineInput {
  const problem = routineProblem(input)
  if (problem) throw new RoutineError(400, problem)
  return normalizeRoutine(input as RoutineInput)
}

export async function createRoutine(userId: string, input: unknown) {
  const clean = check(input)
  if ((await Routine.countDocuments({ userId })) >= MAX_ROUTINES) throw new RoutineError(409, `You can keep up to ${MAX_ROUTINES} routines. Delete one to add another.`)
  return toJson(await Routine.create({ userId, ...clean }))
}

export async function updateRoutine(userId: string, id: string, input: unknown) {
  const clean = check(input)
  const doc = await Routine.findOneAndUpdate({ _id: id, userId }, { $set: clean }, { new: true })
  if (!doc) throw new RoutineError(404, 'Routine not found')
  return toJson(doc)
}

export async function deleteRoutine(userId: string, id: string) {
  const doc = await Routine.findOneAndDelete({ _id: id, userId })
  if (!doc) throw new RoutineError(404, 'Routine not found')
  return { ok: true }
}

/**
 * Put a routine's steps on a day as tasks. Steps already added (same routine + step) are left alone,
 * so it is safe to call twice or to re-plan the day. Returns how many tasks were created.
 */
export async function addRoutineToDay(userId: string, routine: RoutineJson, dayKey: string, blocks: DayBlock[]) {
  const date = dateOf(dayKey)
  const keys = routine.items.map((i: RoutineItem) => routineKey(routine.id, i.id))
  const existing = new Set((await Task.find({ userId, date, routineKey: { $in: keys } }, { routineKey: 1 })).map((t: any) => t.routineKey))
  const fresh = routine.items.filter((i: RoutineItem) => !existing.has(routineKey(routine.id, i.id)))
  if (fresh.length === 0) return 0
  await Task.insertMany(fresh.map((i: RoutineItem) => ({
    userId,
    title: i.title,
    date,
    timeBlock: i.startTime ? blockForTime(i.startTime, blocks) : blocks[0].id,
    // A step with a start time is a fixed-time item on the day; one without is a plain task
    ...(i.startTime ? { isEvent: true, startTime: i.startTime, endTime: addMinutes(i.startTime, i.minutes ?? 30) } : {}),
    intensity: i.intensity,
    priority: 'medium',
    source: 'routine',
    routineKey: routineKey(routine.id, i.id),
    status: 'pending',
  })))
  return fresh.length
}

export async function applyRoutine(userId: string, id: string, dayKey: unknown) {
  if (typeof dayKey !== 'string' || !DAY_KEY.test(dayKey)) throw new RoutineError(400, 'Pick a day')
  const doc = await Routine.findOne({ _id: id, userId })
  if (!doc) throw new RoutineError(404, 'Routine not found')
  const added = await addRoutineToDay(userId, toJson(doc), dayKey, await getUserBlocks(userId))
  return { added }
}

/** Called when a day is planned: adds every automatic routine that runs on that weekday. */
export async function addAutoRoutines(userId: string, dayKey: string, blocks: DayBlock[]) {
  const routines = await Routine.find({ userId, autoAdd: true })
  let added = 0
  for (const r of routines) {
    if (routineRunsOn(r, dayKey)) added += await addRoutineToDay(userId, toJson(r), dayKey, blocks)
  }
  return added
}
