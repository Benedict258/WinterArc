import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { blocksProblem, focusOf, weightsForFocus, hourLabel, MAX_BLOCKS, MIN_BLOCKS, type DayBlock, type Focus } from '@/shared/dayBlocks'

const FOCUS_LABEL: Record<Focus, string> = { heavy: 'Heavy work', medium: 'Medium work', light: 'Light work', any: 'Anything' }
const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'

/** Edit a day structure: 2 to 6 blocks, each with a name, start hour and the kind of work it suits. */
export default function BlockEditor({ blocks, onChange }: { blocks: DayBlock[]; onChange: (blocks: DayBlock[]) => void }) {
  const problem = blocksProblem(blocks)
  const update = (i: number, patch: Partial<DayBlock>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  const add = () => {
    const last = blocks[blocks.length - 1]
    const id = `b${Date.now().toString(36)}`
    onChange([...blocks, { id, label: 'New block', start: Math.min(23, last.start + 3), weights: weightsForFocus('any') }])
  }

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2 p-2.5 border border-border rounded-lg bg-card">
          <input
            aria-label={`Name of block ${i + 1}`}
            value={b.label}
            maxLength={24}
            onChange={e => update(i, { label: e.target.value })}
            className={`${field} flex-1 min-w-[8rem]`}
          />
          <select aria-label={`Start of ${b.label}`} value={b.start} onChange={e => update(i, { start: Number(e.target.value) })} className={field}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>from {hourLabel(h)}</option>)}
          </select>
          <select aria-label={`Best work for ${b.label}`} value={focusOf(b.weights)} onChange={e => update(i, { weights: weightsForFocus(e.target.value as Focus) })} className={field}>
            {(Object.keys(FOCUS_LABEL) as Focus[]).map(f => <option key={f} value={f}>{FOCUS_LABEL[f]}</option>)}
          </select>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${b.label}`} disabled={blocks.length <= MIN_BLOCKS} onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={blocks.length >= MAX_BLOCKS || blocks[blocks.length - 1].start >= 23}>
          <Plus size={14} className="mr-1" /> Add block
        </Button>
        <span className="text-xs text-muted-foreground">{blocks.length} of {MIN_BLOCKS}–{MAX_BLOCKS}</span>
      </div>
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
    </div>
  )
}
