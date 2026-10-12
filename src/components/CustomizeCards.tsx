import { useEffect, useState } from 'react'
import { Check, LayoutGrid, Palette, SlidersHorizontal, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import BlockEditor from '@/components/BlockEditor'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/use-toast'
import { blocksProblem, normalizeBlocks, type DayBlock } from '@/shared/dayBlocks'
import { ACCENTS, MODULES, normalizeAppearance, normalizeModules, type Appearance } from '@/shared/appearance'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Rebuild this week so the new structure or rules show up straight away. */
async function replan() {
  await fetch('/api/grid/rebalance', { method: 'POST' }).catch(() => {})
}

export function DayStructureCard() {
  const { data: settings } = useSettings()
  const { mutate: save, isPending } = useUpdateSettings()
  const { toast } = useToast()
  const saved = normalizeBlocks(settings?.planner?.blocks)
  const [blocks, setBlocks] = useState<DayBlock[]>(saved)
  useEffect(() => { setBlocks(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(blocks, saved)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock size={20} />Your day</CardTitle>
        <CardDescription>Split your day into 2 to 6 blocks. The planner puts heavy, medium and light work where each block says it fits best, and events land in the block they start in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <BlockEditor blocks={blocks} onChange={setBlocks} />
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setBlocks(saved)}>Reset</Button>}
          <Button
            size="sm"
            disabled={!dirty || isPending || !!blocksProblem(blocks)}
            onClick={() => save({ planner: { blocks } }, {
              onSuccess: () => { toast({ title: 'Day structure saved' }); void replan() },
            })}
          >
            {isPending ? 'Saving…' : 'Save day structure'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Toggle({ id, checked, onChange, title, blurb }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: string; blurb: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer" />
      <label htmlFor={id} className="text-sm cursor-pointer">
        <span className="font-medium block">{title}</span>
        <span className="text-xs text-muted-foreground">{blurb}</span>
      </label>
    </div>
  )
}

export function PlannerRulesCard() {
  const { data: settings } = useSettings()
  const { mutate: save, isPending } = useUpdateSettings()
  const { toast } = useToast()
  const p = settings?.planner
  const saved = { rollover: p?.rollover ?? true, makeup: p?.makeup ?? true, backlogPerDay: p?.backlogPerDay ?? 2, dueWindowDays: p?.dueWindowDays ?? 3 }
  const [rules, setRules] = useState(saved)
  useEffect(() => { setRules(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(rules, saved)
  const num = (label: string, key: 'backlogPerDay' | 'dueWindowDays', min: number, max: number, help: string) => (
    <div>
      <label htmlFor={key} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3 mt-2">
        <input id={key} type="range" min={min} max={max} value={rules[key]} onChange={e => setRules(r => ({ ...r, [key]: Number(e.target.value) }))} className="flex-1 accent-primary" />
        <span className="text-sm font-mono w-8 text-right">{rules[key]}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{help}</p>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal size={20} />Planner rules</CardTitle>
        <CardDescription>How the planner handles missed work, backlog and deadlines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Toggle id="rollover" checked={rules.rollover} onChange={v => setRules(r => ({ ...r, rollover: v }))} title="Roll over missed work" blurb="Unfinished planner-placed tasks go back to their queue each morning, and passed events are marked missed." />
        <Toggle id="makeup" checked={rules.makeup} onChange={v => setRules(r => ({ ...r, makeup: v }))} title="Make up missed fixed-day work" blurb="If a fixed-day thread is missed, it gets one makeup the next day." />
        {num('Backlog tasks pulled in per day', 'backlogPerDay', 0, 5, 'Loose tasks with no thread or due date added when a day has room. 0 turns it off.')}
        {num('Due-date window (days)', 'dueWindowDays', 0, 14, 'How many days before a due date the planner starts placing the task.')}
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setRules(saved)}>Reset</Button>}
          <Button size="sm" disabled={!dirty || isPending} onClick={() => save({ planner: rules }, { onSuccess: () => { toast({ title: 'Planner rules saved' }); void replan() } })}>
            {isPending ? 'Saving…' : 'Save planner rules'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function AppearanceCard() {
  const { data: settings } = useSettings()
  const { mutate: save } = useUpdateSettings()
  const look = normalizeAppearance(settings?.appearance)
  // Applied immediately (AppearanceApplier follows settings); each click saves
  const set = (patch: Partial<Appearance>) => save({ appearance: patch })
  const seg = (active: boolean) => `px-3 py-1.5 text-sm rounded-md border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette size={20} />Look & feel</CardTitle>
        <CardDescription>Applies on every device you sign in on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-sm font-medium mb-2">Theme</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
            {(['dark', 'light', 'system'] as const).map(m => (
              <button key={m} onClick={() => set({ mode: m })} aria-pressed={look.mode === m} className={seg(look.mode === m)}>{m === 'system' ? 'Match device' : m === 'dark' ? 'Dark' : 'Light'}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Accent colour</p>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Accent colour">
            {ACCENTS.map(a => (
              <button
                key={a.id}
                onClick={() => set({ accent: a.id })}
                aria-label={a.label}
                aria-pressed={look.accent === a.id}
                title={a.label}
                className={`h-9 w-9 rounded-full border-2 flex items-center justify-center ${look.accent === a.id ? 'border-foreground' : 'border-transparent'}`}
                style={{ background: `hsl(${a.hsl})`, color: `hsl(${a.foreground})` }}
              >
                {look.accent === a.id && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Density</p>
          <div className="flex gap-2" role="group" aria-label="Density">
            {(['comfortable', 'compact'] as const).map(d => (
              <button key={d} onClick={() => set({ density: d })} aria-pressed={look.density === d} className={seg(look.density === d)}>{d === 'comfortable' ? 'Comfortable' : 'Compact'}</button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ModulesCard() {
  const { data: settings } = useSettings()
  const { mutate: save } = useUpdateSettings()
  const modules = normalizeModules(settings?.modules)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LayoutGrid size={20} />Features</CardTitle>
        <CardDescription>Turn off what you don't use. Your data stays; it just hides from the menu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {MODULES.map(m => (
          <Toggle key={m.id} id={`mod-${m.id}`} checked={modules[m.id]} onChange={v => save({ modules: { [m.id]: v } })} title={m.label} blurb={m.blurb} />
        ))}
      </CardContent>
    </Card>
  )
}
