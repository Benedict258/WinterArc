import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CalendarPlus, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'
import { MAX_ROUTINE_ITEMS, WEEKDAY_LABELS, routineProblem, type RoutineInput, type RoutineItem } from '@/shared/routines'

type Routine = RoutineInput & { id: string }

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const newId = () => Math.random().toString(36).slice(2, 10)
const blankItem = (): RoutineItem => ({ id: newId(), title: '', startTime: null, minutes: null, intensity: 'light' })
const blank = (): RoutineInput => ({ name: '', weekdays: [1, 2, 3, 4, 5], autoAdd: false, items: [blankItem()] })
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const STARTERS: { label: string; build: () => RoutineInput }[] = [
  { label: 'Morning routine', build: () => ({ name: 'Morning routine', weekdays: [1, 2, 3, 4, 5], autoAdd: false, items: [
    { id: newId(), title: 'Drink water and stretch', startTime: '07:00', minutes: 10, intensity: 'light' },
    { id: newId(), title: 'Plan the day', startTime: '07:15', minutes: 10, intensity: 'light' },
    { id: newId(), title: 'First focus round', startTime: '08:00', minutes: 25, intensity: 'medium' },
  ] }) },
  { label: 'Study block', build: () => ({ name: 'Study block', weekdays: [1, 3, 5], autoAdd: false, items: [
    { id: newId(), title: 'Review yesterday’s notes', startTime: null, minutes: 15, intensity: 'light' },
    { id: newId(), title: 'Deep study (2 rounds)', startTime: null, minutes: 50, intensity: 'heavy' },
    { id: newId(), title: 'Practice questions', startTime: null, minutes: 30, intensity: 'medium' },
  ] }) },
  { label: 'Evening wind-down', build: () => ({ name: 'Evening wind-down', weekdays: [0, 1, 2, 3, 4, 5, 6], autoAdd: false, items: [
    { id: newId(), title: 'Tidy up and prepare tomorrow', startTime: '21:00', minutes: 15, intensity: 'light' },
    { id: newId(), title: 'Read', startTime: '21:30', minutes: 30, intensity: 'light' },
  ] }) },
]

async function call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data as T
}

function Editor({ initial, onSave, onCancel, saving }: { initial: RoutineInput; onSave: (r: RoutineInput) => void; onCancel: () => void; saving: boolean }) {
  const [r, setR] = useState<RoutineInput>(initial)
  const problem = routineProblem({ ...r, name: r.name, items: r.items.map(i => ({ ...i, title: i.title })) })
  const setItem = (id: string, patch: Partial<RoutineItem>) => setR(x => ({ ...x, items: x.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }))
  const move = (index: number, by: -1 | 1) => setR(x => {
    const items = [...x.items]; const j = index + by
    if (j < 0 || j >= items.length) return x
    ;[items[index], items[j]] = [items[j], items[index]]
    return { ...x, items }
  })
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{initial.name ? 'Edit routine' : 'New routine'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <input className={`${field} w-full`} aria-label="Routine name" placeholder="Name, e.g. Morning routine" maxLength={60} value={r.name} onChange={e => setR(x => ({ ...x, name: e.target.value }))} />
        <div>
          <p className="text-sm text-muted-foreground mb-1">Days it usually happens</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => {
              const on = r.weekdays.includes(d)
              return <button key={d} type="button" aria-pressed={on} onClick={() => setR(x => ({ ...x, weekdays: on ? x.weekdays.filter(w => w !== d) : [...x.weekdays, d] }))}
                className={`px-2.5 py-1 rounded-md border text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>{label}</button>
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={r.autoAdd} onChange={e => setR(x => ({ ...x, autoAdd: e.target.checked }))} /> Add it to those days automatically</label>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Steps</p>
          {r.items.map((i, idx) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <input className={`${field} flex-1 min-w-[10rem]`} aria-label={`Step ${idx + 1} title`} placeholder="What to do" maxLength={120} value={i.title} onChange={e => setItem(i.id, { title: e.target.value })} />
              <input type="time" className={field} aria-label={`Step ${idx + 1} start time`} value={i.startTime ?? ''} onChange={e => setItem(i.id, { startTime: e.target.value || null })} />
              <input type="number" min={1} max={600} className={`${field} w-20`} aria-label={`Step ${idx + 1} minutes`} placeholder="min" value={i.minutes ?? ''} onChange={e => setItem(i.id, { minutes: e.target.value ? Number(e.target.value) : null })} />
              <select className={field} aria-label={`Step ${idx + 1} effort`} value={i.intensity} onChange={e => setItem(i.id, { intensity: e.target.value as RoutineItem['intensity'] })}>
                <option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option>
              </select>
              <div className="flex">
                <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                <button type="button" className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === r.items.length - 1} onClick={() => move(idx, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                <button type="button" className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={r.items.length === 1} onClick={() => setR(x => ({ ...x, items: x.items.filter(y => y.id !== i.id) }))} aria-label="Remove step"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={r.items.length >= MAX_ROUTINE_ITEMS} onClick={() => setR(x => ({ ...x, items: [...x.items, blankItem()] }))}><Plus size={14} /> Add a step</Button>
          <p className="text-xs text-muted-foreground">A step with a start time becomes a timed item on the day; one without is a normal task.</p>
        </div>

        {problem && r.name !== '' && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!!problem || saving} onClick={() => onSave(r)}>{saving ? 'Saving…' : 'Save routine'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RoutinesPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: routines = [], isLoading } = useQuery({ queryKey: ['routines'], queryFn: () => call<Routine[]>('/api/routines') })
  const [editing, setEditing] = useState<{ id: string | null; value: RoutineInput } | null>(null)
  const [day, setDay] = useState(todayKey())
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['routines'] })
  const err = (title: string) => (e: Error) => toast({ title, description: e.message, variant: 'destructive' })

  const save = useMutation({
    mutationFn: (v: { id: string | null; value: RoutineInput }) => (v.id ? call(`/api/routines/${v.id}`, 'PUT', v.value) : call('/api/routines', 'POST', v.value)),
    onSuccess: () => { setEditing(null); refresh() },
    onError: err('Couldn’t save the routine'),
  })
  const apply = useMutation({
    mutationFn: (id: string) => call<{ added: number }>(`/api/routines/${id}/apply`, 'POST', { date: day }),
    onSuccess: r => {
      toast({ title: r.added ? `Added ${r.added} item${r.added > 1 ? 's' : ''}` : 'Already on that day', description: r.added ? undefined : 'Nothing new to add.' })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: err('Couldn’t add it'),
  })
  const remove = async (r: Routine) => {
    if (await confirmDialog({ title: `Delete “${r.name}”?`, description: 'Tasks it already added to your days stay.', confirmLabel: 'Delete', destructive: true })) {
      try { await call(`/api/routines/${r.id}`, 'DELETE'); refresh() } catch (e) { err('Couldn’t delete')(e as Error) }
    }
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><ListChecks className="text-primary" size={28} /> Routines</h1>
            <p className="text-muted-foreground mt-1">Build a routine once, then add it to any day, or let it add itself.</p>
          </div>
          {!editing && <Button className="gap-1.5" onClick={() => setEditing({ id: null, value: blank() })}><Plus size={16} /> New routine</Button>}
        </div>

        {editing && <Editor initial={editing.value} saving={save.isPending} onCancel={() => setEditing(null)} onSave={value => save.mutate({ id: editing.id, value })} />}

        {!editing && routines.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">“Add to day” uses</span>
            <input type="date" className={field} value={day} onChange={e => setDay(e.target.value)} aria-label="Day to add routines to" />
          </label>
        )}

        {routines.map(r => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-lg break-words">{r.name}</CardTitle>
                  <CardDescription>
                    {r.weekdays.length ? r.weekdays.map(d => WEEKDAY_LABELS[d]).join(' · ') : 'No fixed days'}{r.autoAdd && ' · adds itself'}
                  </CardDescription>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" className="gap-1.5" disabled={apply.isPending || !day} onClick={() => apply.mutate(r.id)}><CalendarPlus size={14} /> Add to day</Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing({ id: r.id, value: { name: r.name, weekdays: r.weekdays, autoAdd: r.autoAdd, items: r.items } })}><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${r.name}`} onClick={() => remove(r)}><Trash2 size={14} /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="text-sm space-y-1">
                {r.items.map(i => (
                  <li key={i.id} className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground font-mono">{i.startTime ?? '—'}</span><span className="break-words">{i.title}{i.minutes ? <span className="text-muted-foreground"> · {i.minutes}m</span> : null}</span></li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}

        {!isLoading && routines.length === 0 && !editing && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-muted-foreground">No routines yet. Start from one of these and change it, or build your own.</p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map(s => <Button key={s.label} variant="outline" size="sm" onClick={() => setEditing({ id: null, value: s.build() })}>{s.label}</Button>)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
