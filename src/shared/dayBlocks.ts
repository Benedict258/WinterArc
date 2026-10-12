// A person's day structure: 2 to 6 ordered blocks. Shared by the planner (server) and the screens.

export type Intensity = 'light' | 'medium' | 'heavy'

export type DayBlock = {
  /** stable key stored on tasks (timeBlock) */
  id: string
  label: string
  /** hour (0-23) the block begins; it runs until the next block begins */
  start: number
  /** how much this block is disfavoured for each intensity (lower = preferred) */
  weights: Record<Intensity, number>
}

export const MIN_BLOCKS = 2
export const MAX_BLOCKS = 6
export const UNSCHEDULED = 'unscheduled'

// Medium work in the morning, light in the afternoon, heavy in the evening
export const DEFAULT_BLOCKS: DayBlock[] = [
  { id: 'morning', label: 'Morning', start: 6, weights: { light: 1, medium: 0, heavy: 4 } },
  { id: 'afternoon', label: 'Afternoon', start: 12, weights: { light: 0, medium: 1, heavy: 2 } },
  { id: 'evening', label: 'Evening', start: 17, weights: { light: 1, medium: 1, heavy: 0 } },
]

const ID = /^[a-z0-9][a-z0-9-]{0,23}$/

/** Problems with a proposed day structure, or null when it is usable. */
export function blocksProblem(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return 'Blocks must be a list'
  if (blocks.length < MIN_BLOCKS || blocks.length > MAX_BLOCKS) return `Use ${MIN_BLOCKS} to ${MAX_BLOCKS} blocks`
  const ids = new Set<string>()
  let prev = -1
  for (const b of blocks) {
    if (!b || typeof b.id !== 'string' || !ID.test(b.id) || b.id === UNSCHEDULED) return 'Each block needs a short id'
    if (ids.has(b.id)) return 'Block ids must be unique'
    ids.add(b.id)
    if (typeof b.label !== 'string' || !b.label.trim() || b.label.length > 24) return 'Each block needs a name (up to 24 characters)'
    if (!Number.isInteger(b.start) || b.start < 0 || b.start > 23) return 'Start hour must be 0 to 23'
    if (b.start <= prev) return 'Blocks must start in order, each later than the one before'
    prev = b.start
    for (const k of ['light', 'medium', 'heavy']) {
      const w = b.weights?.[k]
      if (!Number.isFinite(w) || w < 0 || w > 10) return 'Weights must be 0 to 10'
    }
  }
  return null
}

/** The user's blocks if they are valid, otherwise the defaults. */
export function normalizeBlocks(raw: unknown): DayBlock[] {
  if (blocksProblem(raw)) return DEFAULT_BLOCKS
  return (raw as DayBlock[]).map(b => ({
    id: b.id,
    label: b.label.trim(),
    start: b.start,
    weights: { light: b.weights.light, medium: b.weights.medium, heavy: b.weights.heavy },
  }))
}

export const blockIds = (blocks: DayBlock[]) => blocks.map(b => b.id)

/** Block containing a wall-clock time ('HH:mm'). Times before the first start belong to the first block. */
export function blockForTime(time: string | null | undefined, blocks: DayBlock[] = DEFAULT_BLOCKS): string {
  const hour = Number((time ?? '').split(':')[0])
  if (!Number.isFinite(hour)) return blocks[0].id
  let found = blocks[0]
  for (const b of blocks) if (hour >= b.start) found = b
  return found.id
}

/** Block for a task of this intensity, given the load already in each block. */
export function pickBlock(loads: Record<string, number>, intensity: string, blocks: DayBlock[] = DEFAULT_BLOCKS): string {
  const key = (intensity in { light: 1, medium: 1, heavy: 1 } ? intensity : 'medium') as Intensity
  let best = blocks[0].id
  let bestCost = Infinity
  for (const b of blocks) {
    const cost = (loads[b.id] ?? 0) + b.weights[key]
    if (cost < bestCost) {
      best = b.id
      bestCost = cost
    }
  }
  return best
}

/**
 * Where a stored block id sits in the current structure. Known ids stay put; the original
 * morning/afternoon/evening land in whichever block now covers their old time; anything
 * else falls to the first block. 'unscheduled' stays unscheduled.
 */
export function resolveBlock(id: string | null | undefined, blocks: DayBlock[]): string {
  if (!id || id === UNSCHEDULED) return UNSCHEDULED
  if (blocks.some(b => b.id === id)) return id
  const legacyHour: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '19:00' }
  return legacyHour[id] ? blockForTime(legacyHour[id], blocks) : blocks[0].id
}

export const emptyLoads = (blocks: DayBlock[]) => Object.fromEntries(blocks.map(b => [b.id, 0])) as Record<string, number>

/** '6 AM', '12 PM' … */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
}

/** Time range text for block i: '6 AM – 12 PM'; the last block reads 'from 5 PM'. */
export function blockRange(blocks: DayBlock[], index: number): string {
  const b = blocks[index]
  const next = blocks[index + 1]
  return next ? `${hourLabel(b.start)} – ${hourLabel(next.start)}` : `from ${hourLabel(b.start)}`
}

/** What a block is best for, in plain words: the intensity it favours (or 'any'). */
export type Focus = Intensity | 'any'

export function focusOf(weights: DayBlock['weights']): Focus {
  const { light, medium, heavy } = weights
  if (light === medium && medium === heavy) return 'any'
  const min = Math.min(light, medium, heavy)
  // ties between two intensities read as the heavier one
  return heavy === min ? 'heavy' : medium === min ? 'medium' : 'light'
}

export function weightsForFocus(focus: Focus): DayBlock['weights'] {
  switch (focus) {
    case 'heavy': return { light: 2, medium: 1, heavy: 0 }
    case 'medium': return { light: 1, medium: 0, heavy: 3 }
    case 'light': return { light: 0, medium: 1, heavy: 4 }
    default: return { light: 0, medium: 0, heavy: 0 }
  }
}
