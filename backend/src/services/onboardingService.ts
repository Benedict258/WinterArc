import { User } from '../models/User'
import { Thread } from '../models/Thread'
import { Task } from '../models/Task'
import { Settings } from '../models/Settings'
import { getTemplate, PRESETS, type PresetId } from '../../../src/shared/templates'
import { blocksProblem, UNSCHEDULED, type DayBlock } from '../../../src/shared/dayBlocks'
import { rebalanceWeek } from './dailyGenerationService'

export type OnboardingInput = {
  templateId: string
  /** keys of the template's threads to create (default: every thread that is on by default) */
  threads?: string[]
  blocks?: DayBlock[]
  preset?: PresetId
  timezone?: string
}

export class AlreadyOnboardedError extends Error {
  constructor() { super('Setup is already done'); this.name = 'AlreadyOnboardedError' }
}

/**
 * First-run setup: create the chosen template's threads and example tasks and save the day
 * structure and planner preset. Runs once per user (claimed atomically); skipping is the Blank template.
 */
export async function applyOnboarding(userId: string, input: OnboardingInput) {
  const template = getTemplate(input.templateId)
  if (!template) throw new Error('Unknown template')
  const keep = new Set(input.threads ?? template.threads.filter(t => !t.optional).map(t => t.key))
  for (const key of keep) if (!template.threads.some(t => t.key === key)) throw new Error(`Unknown thread: ${key}`)
  const blocks = input.blocks ?? template.blocks
  const problem = blocksProblem(blocks)
  if (problem) throw new Error(problem)
  const preset = PRESETS[input.preset ?? template.preset]
  if (!preset) throw new Error('Unknown preset')

  const claim = await User.updateOne({ _id: userId, onboardedAt: null }, { $set: { onboardedAt: new Date() } })
  if (claim.matchedCount === 0) throw new AlreadyOnboardedError()

  try {
    const idByKey = new Map<string, string>()
    for (const t of template.threads.filter(t => keep.has(t.key))) {
      const doc = await Thread.create({
        userId, name: t.name, category: t.category, frequency: t.frequency, fixedDay: t.fixedDay,
        priority: t.priority, intensity: t.intensity, taskMode: t.taskMode, notes: t.notes,
        eventStart: t.eventStart ?? null, eventEnd: t.eventEnd ?? null, eventDays: t.eventDays ?? [],
      })
      idByKey.set(t.key, String(doc._id))
    }
    for (const task of template.tasks) {
      if (task.thread && !idByKey.has(task.thread)) continue // its thread was left out
      await Task.create({
        userId, title: task.title, threadId: task.thread ? idByKey.get(task.thread) : null,
        intensity: task.intensity, timeBlock: UNSCHEDULED, date: null, status: 'pending', source: 'manual',
      })
    }
    const set: Record<string, unknown> = {
      'planner.blocks': blocks,
      'planner.backlogPerDay': preset.backlogPerDay,
      'gridBalancing.maxDailyIntensity': preset.maxDailyIntensity,
    }
    if (input.timezone) set.timezone = input.timezone
    await Settings.updateOne({ userId }, { $set: set }, { upsert: true })
  } catch (error) {
    await User.updateOne({ _id: userId }, { $set: { onboardedAt: null } }) // let them try again
    throw error
  }

  // Today may already have been planned (empty); plan again with the new threads
  await rebalanceWeek(userId).catch(() => {})
  return { threads: keep.size }
}
