import { useMemo } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { normalizeBlocks, blockRange, resolveBlock, UNSCHEDULED, type DayBlock } from '@/shared/dayBlocks'

/** The user's day structure (defaults until settings load), plus helpers for screens. */
export function useDayBlocks() {
  const { data: settings } = useSettings()
  return useMemo(() => {
    const blocks: DayBlock[] = normalizeBlocks(settings?.planner?.blocks)
    return {
      blocks,
      /** for <select>: id, label and hours */
      options: blocks.map((b, i) => ({ id: b.id, label: b.label, range: blockRange(blocks, i) })),
      /** the block a stored task.timeBlock belongs to now */
      resolve: (id: string | null | undefined) => resolveBlock(id, blocks),
      unscheduled: UNSCHEDULED,
    }
  }, [settings?.planner?.blocks])
}
