import { useState } from 'react'
import { Archive, Check, Flame, Minus, Pencil, Plus, Sprout, Trash2 } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import AssistantChat, { type Quick } from '@/components/AssistantChat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { confirmDialog } from '@/components/DialogHost'
import { useCheckIn, useHabitMutations, useHabits, useMonthly, type Habit } from '@/hooks/useHabits'
import { ALL_DAYS, habitProblem } from '@/shared/habits'
import { WEEKDAY_LABELS } from '@/shared/routines'

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const pct = (r: number) => `${Math.round(r * 100)}%`
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

const CHAT_QUICK: Quick[] = [
  { label: 'Log what I did today', prompt: 'Here is what I did today: ', focus: true },
  { label: 'How consistent am I?', prompt: 'How consistent have I been this month? Be honest, and tell me which habit needs attention.' },
  { label: 'Suggest a new habit', prompt: 'Look at my habits and plan, and suggest one small habit that would help.' },
  { label: 'Undo my last log', prompt: 'Undo the last thing you logged for me today.' },
]

type Draft = { name: string; emoji: string; unit: string; weekdays: number[]; target: number }
const blank = (): Draft => ({ name: '', emoji: '', unit: '', weekdays: ALL_DAYS, target: 1 })

function Editor({ initial, saving, onSave, onCancel }: { initial: Draft; saving: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const problem = habitProblem(d)
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{initial.name ? 'Edit habit' : 'New habit'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <input className={`${field} w-16 text-center`} aria-label="Emoji" placeholder="🙂" maxLength={4} value={d.emoji} onChange={e => setD(x => ({ ...x, emoji: e.target.value }))} />
          <input className={`${field} flex-1`} aria-label="Habit name" placeholder="e.g. Read, Drink water, Stretch" maxLength={60} value={d.name} onChange={e => setD(x => ({ ...x, name: e.target.value }))} />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Counts per day to be done</span>
            <input type="number" min={1} max={1000} className={`${field} w-28`} aria-label="Daily target" value={d.target} onChange={e => setD(x => ({ ...x, target: Number(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Unit (optional)</span>
            <input className={`${field} w-32`} aria-label="Unit" placeholder="pages, glasses…" maxLength={16} value={d.unit} onChange={e => setD(x => ({ ...x, unit: e.target.value }))} /></label>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Days it’s expected</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => {
              const on = d.weekdays.includes(i)
              return <button key={i} type="button" aria-pressed={on} onClick={() => setD(x => ({ ...x, weekdays: on ? x.weekdays.filter(w => w !== i) : [...x.weekdays, i] }))}
                className={`px-2.5 py-1 rounded-md border text-sm ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>{label}</button>
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Days it isn’t expected never break your streak.</p>
        </div>
        {problem && d.name !== '' && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!!problem || saving} onClick={() => onSave(d)}>{saving ? 'Saving…' : 'Save habit'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const checkIn = useCheckIn()
  const { archive, remove } = useHabitMutations()
  const count = habit.target > 1
  const pctDone = Math.min(100, Math.round((habit.today.value / habit.target) * 100))
  const label = `${habit.emoji} ${habit.name}`.trim()
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg break-words">{label}</CardTitle>
            <CardDescription>
              {habit.weekdays.length === 7 ? 'Every day' : habit.weekdays.map(d => WEEKDAY_LABELS[d]).join(' · ')}{count && ` · ${habit.target}${habit.unit ? ` ${habit.unit}` : ''} a day`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="flex items-center gap-1 text-sm font-semibold mr-1" title={`Best: ${habit.streak.best} days`} aria-label={`Streak ${habit.streak.current} days`}>
              <Flame size={16} className={habit.streak.current > 0 ? 'text-primary' : 'text-muted-foreground'} />{habit.streak.current}
            </span>
            <Button size="sm" variant="ghost" aria-label={`Edit ${habit.name}`} onClick={onEdit}><Pencil size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`Archive ${habit.name}`} onClick={async () => { if (await confirmDialog({ title: `Stop tracking “${habit.name}”?`, description: 'Its history is kept in your monthly averages.', confirmLabel: 'Archive' })) archive.mutate(habit.id) }}><Archive size={14} /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${habit.name}`} onClick={async () => { if (await confirmDialog({ title: `Delete “${habit.name}”?`, description: 'This removes the habit and everything you logged for it.', confirmLabel: 'Delete', destructive: true })) remove.mutate(habit.id) }}><Trash2 size={14} /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          {count ? (
            <>
              <Button size="icon" variant="outline" aria-label={`One less ${habit.name}`} disabled={habit.today.value <= 0} onClick={() => checkIn.mutate({ id: habit.id, add: -1 })}><Minus size={16} /></Button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" aria-live="polite">{habit.today.value} / {habit.target}{habit.unit ? ` ${habit.unit}` : ''}{habit.today.done && ' · done'}</p>
                <div className="h-2 mt-1 rounded bg-secondary overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${pctDone}%` }} /></div>
              </div>
              <Button size="icon" aria-label={`One more ${habit.name}`} onClick={() => checkIn.mutate({ id: habit.id, add: 1 })}><Plus size={16} /></Button>
              {!habit.today.done && <Button size="sm" variant="outline" onClick={() => checkIn.mutate({ id: habit.id, value: habit.target })}>Done</Button>}
            </>
          ) : (
            <Button className="gap-2" variant={habit.today.done ? 'default' : 'outline'} aria-pressed={habit.today.done} aria-label={`${habit.today.done ? 'Undo' : 'Mark'} ${habit.name} today`}
              onClick={() => checkIn.mutate({ id: habit.id, value: habit.today.done ? 0 : 1 })}>
              <Check size={16} /> {habit.today.done ? 'Done today' : habit.today.scheduled ? 'Mark done' : 'Not due today · mark anyway'}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1" aria-label="Last 14 days">
          {habit.last14.map(d => (
            <button key={d.day} type="button" title={`${dayLabel(d.day)}: ${d.value}/${habit.target}${d.scheduled ? '' : ' (not expected)'}`}
              aria-label={`${habit.name}, ${dayLabel(d.day)}: ${d.done ? 'done' : 'not done'}`}
              onClick={() => checkIn.mutate({ id: habit.id, day: d.day, value: d.done ? 0 : habit.target })}
              className={`flex-1 h-5 rounded-sm border transition-colors ${d.done ? 'bg-primary border-primary' : d.value > 0 ? 'bg-primary/40 border-primary/40' : d.scheduled ? 'bg-secondary border-border hover:border-primary' : 'bg-transparent border-dashed border-border opacity-60 hover:opacity-100'}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Last 7 days {pct(habit.weekRate)} · this month {pct(habit.monthRate)} · best streak {habit.streak.best}</p>
      </CardContent>
    </Card>
  )
}

function MonthlyCard() {
  const { data } = useMonthly()
  if (!data || data.overall.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Monthly averages</CardTitle>
        <CardDescription>Share of expected days you completed, across all your habits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {data.overall.map(m => (
            <li key={m.month} className="space-y-1">
              <div className="flex justify-between text-sm"><span>{monthName(m.month)}{m.month === data.today.slice(0, 7) && <span className="text-muted-foreground"> · so far</span>}</span><span className="font-semibold">{pct(m.rate)}</span></div>
              <div className="h-2 rounded bg-secondary overflow-hidden" role="img" aria-label={`${monthName(m.month)}: ${pct(m.rate)}`}><div className="h-full bg-primary" style={{ width: pct(m.rate) }} /></div>
            </li>
          ))}
        </ul>
        {data.habits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-normal">Habit</th>{data.overall.slice(0, 3).map(m => <th key={m.month} className="py-1 px-2 font-normal text-right">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</th>)}</tr></thead>
              <tbody>
                {data.habits.map(h => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 break-words">{h.emoji} {h.name}</td>
                    {data.overall.slice(0, 3).map(m => { const row = h.rows.find(r => r.month === m.month); return <td key={m.month} className="py-1.5 px-2 text-right tabular-nums">{row && row.scheduled > 0 ? pct(row.rate) : '—'}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function HabitsPage() {
  const { data, isLoading } = useHabits()
  const { save } = useHabitMutations()
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const habits = data?.habits ?? []
  const open = habits.filter(h => h.today.scheduled && !h.today.done).length

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Sprout className="text-primary" size={28} /> Habits</h1>
            <p className="text-muted-foreground mt-1">{habits.length === 0 ? 'Small things you want to do again and again.' : open === 0 ? 'Everything due today is done.' : `${open} still to do today.`}</p>
          </div>
          {!editing && <Button className="gap-1.5" onClick={() => setEditing({ id: null, draft: blank() })}><Plus size={16} /> New habit</Button>}
        </div>

        {editing && <Editor initial={editing.draft} saving={save.isPending} onCancel={() => setEditing(null)}
          onSave={d => save.mutate({ id: editing.id, habit: { ...d, emoji: d.emoji.trim(), unit: d.unit.trim() } }, { onSuccess: () => setEditing(null) })} />}

        {habits.map(h => <HabitCard key={h.id} habit={h} onEdit={() => setEditing({ id: h.id, draft: { name: h.name, emoji: h.emoji, unit: h.unit, weekdays: h.weekdays, target: h.target } })} />)}

        {!isLoading && habits.length === 0 && !editing && (
          <Card><CardContent className="pt-6 space-y-3">
            <p className="text-sm text-muted-foreground">No habits yet. Try one of these, or ask the chat below to suggest some.</p>
            <div className="flex flex-wrap gap-2">
              {[{ name: 'Read', emoji: '📚', unit: 'pages', target: 10 }, { name: 'Drink water', emoji: '💧', unit: 'glasses', target: 8 }, { name: 'Exercise', emoji: '🏃', unit: '', target: 1 }, { name: 'Sleep by 11pm', emoji: '🌙', unit: '', target: 1 }].map(s => (
                <Button key={s.name} variant="outline" size="sm" onClick={() => setEditing({ id: null, draft: { ...blank(), ...s } })}>{s.emoji} {s.name}</Button>
              ))}
            </div>
          </CardContent></Card>
        )}

        <MonthlyCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Check in by chat</CardTitle>
            <CardDescription>Tell it what you did, like “read 15 pages and went for a run”. It logs it, tracks your streaks and tells you how you’re doing.</CardDescription>
          </CardHeader>
          <CardContent><AssistantChat quick={CHAT_QUICK} scope="habits" placeholder="What did you do today?" /></CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
