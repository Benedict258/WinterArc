import { Settings } from '../models/Settings'
import { DayBlock, normalizeBlocks, resolveBlock } from '../../../src/shared/dayBlocks'

/** The user's day structure (defaults when they haven't customised it). */
export async function getUserBlocks(userId: string): Promise<DayBlock[]> {
  const settings = await Settings.findOne({ userId }, { planner: 1 })
  return normalizeBlocks(settings?.planner?.blocks)
}

/** Map a client-supplied block id onto the user's current structure (stale ids from offline edits are re-homed). */
export async function resolveTaskBlock(userId: string, timeBlock: unknown): Promise<string | undefined> {
  if (typeof timeBlock !== 'string') return undefined
  return resolveBlock(timeBlock, await getUserBlocks(userId))
}
