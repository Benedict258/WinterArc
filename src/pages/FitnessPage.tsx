import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Dumbbell, Footprints, Pencil, Plus, RefreshCw, Trash2, Trophy } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import AssistantChat, { type Quick } from '@/components/AssistantChat'
import { BarChart, LineChart, Ring, type Datum } from '@/components/charts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useFitness, useFitnessMutations, type Overview, type Workout } from '@/hooks/useFitness'
import { HEALTH_SYNCED, connectHealth, disconnectHealth, healthAvailability, healthConnected, healthSupported, syncHealth } from '@/lib/healthSync'
import {
  MAX_EXERCISES, MAX_SETS, WORKOUT_KINDS, kgToLb, kmToMi, lbToKg, miToKm, normalizeFitnessPrefs, round, workoutProblem, workoutVolumeKg,
  type FitnessPrefs, type Units, type WorkoutInput,
} from '@/shared/fitness'

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmt = new Intl.NumberFormat('en')

const wUnit = (u: Units) => (u === 'imperial' ? 'lb' : 'kg')
const dUnit = (u: Units) => (u === 'imperial' ? 'mi' : 'km')
const showW = (kg: number, u: Units) => round(u === 'imperial' ? kgToLb(kg) : kg, 1)
const readW = (v: number, u: Units) => (u === 'imperial' ? lbToKg(v) : v)
const showD = (km: number, u: Units) => round(u === 'imperial' ? kmToMi(km) : km, 2)
const readD = (v: number, u: Units) => (u === 'imperial' ? miToKm(v) : v)
const num = (s: string) => (s.trim() === '' ? null : Number(s))

const CHAT_QUICK: Quick[] = [
  { label: 'Log a workout', prompt: 'I just did a workout: ', focus: true },
  { label: 'How is my week going?', prompt: 'How is my fitness going this week? Be honest and practical.' },
  { label: 'Plan my next workout', prompt: 'Based on my recent workouts, what should I do next? Keep it simple.' },
]

// ---------------------------------------------------------------- workout form

// `origKg`/`origShown` remember the stored value and how it was displayed, so saving without touching a number never rounds it
type SetDraft = { reps: string; weight: string; origKg?: number; origShown?: string }
type ExDraft = { name: string; sets: SetDraft[] }
type Draft = { day: string; title: string; kind: WorkoutInput['kind']; minutes: string; distance: string; origKm?: number; origDistanceShown?: string; effort: string; notes: string; exercises: ExDraft[] }

const blankDraft = (day: string): Draft => ({ day, title: '', kind: 'strength', minutes: '', distance: '', effort: '', notes: '', exercises: [] })
const fromWorkout = (w: Workout, u: Units): Draft => ({
  day: w.day, title: w.title, kind: w.kind, minutes: w.minutes?.toString() ?? '', distance: w.km != null ? String(showD(w.km, u)) : '', origKm: w.km ?? undefined, origDistanceShown: w.km != null ? String(showD(w.km, u)) : undefined, effort: w.effort?.toString() ?? '', notes: w.notes,
  exercises: w.exercises.map(e => ({ name: e.name, sets: e.sets.map(s => ({ reps: s.reps?.toString() ?? '', weight: s.weightKg != null ? String(showW(s.weightKg, u)) : '', origKg: s.weightKg ?? undefined, origShown: s.weightKg != null ? String(showW(s.weightKg, u)) : undefined })) })),
})
const toInput = (d: Draft, u: Units): WorkoutInput => ({
  day: d.day, title: d.title.trim(), kind: d.kind, minutes: num(d.minutes), km: num(d.distance) === null ? null : d.origKm !== undefined && d.distance === d.origDistanceShown ? d.origKm : round(readD(num(d.distance)!, u), 3), calories: null,
  effort: num(d.effort), notes: d.notes, exercises: d.exercises.filter(e => e.name.trim()).map(e => ({
    name: e.name.trim(),
    sets: e.sets.filter(s => s.reps.trim() || s.weight.trim()).map(s => ({ reps: num(s.reps), weightKg: num(s.weight) === null ? null : s.origKg !== undefined && s.weight === s.origShown ? s.origKg : round(readW(num(s.weight)!, u), 3), seconds: null, km: null })),
  })),
})

function WorkoutForm({ initial, units, saving, onSave, onCancel }: { initial: Draft; units: Units; saving: boolean; onSave: (w: WorkoutInput) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const input = toInput(d, units)
  const problem = workoutProblem(input)
  const setEx = (i: number, patch: Partial<ExDraft>) => setD(x => ({ ...x, exercises: x.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }))
  const showLifts = d.kind === 'strength' || d.kind === 'mobility' || d.exercises.length > 0
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{initial.title ? 'Edit workout' : 'Log a workout'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input className={`${field} flex-1 min-w-[10rem]`} aria-label="Workout title" placeholder="e.g. Push day, 5k run" maxLength={80} value={d.title} onChange={e => setD(x => ({ ...x, title: e.target.value }))} />
          <select className={field} aria-label="Type" value={d.kind} onChange={e => setD(x => ({ ...x, kind: e.target.value as Draft['kind'] }))}>
            {WORKOUT_KINDS.map(k => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
          <input type="date" className={field} aria-label="Date" value={d.day} onChange={e => setD(x => ({ ...x, day: e.target.value }))} />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Minutes</span><input type="number" min={1} className={`${field} w-24`} aria-label="Minutes" value={d.minutes} onChange={e => setD(x => ({ ...x, minutes: e.target.value }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Distance ({dUnit(units)})</span><input type="number" min={0} step="0.01" className={`${field} w-28`} aria-label="Distance" value={d.distance} onChange={e => setD(x => ({ ...x, distance: e.target.value }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Effort (1-10)</span><input type="number" min={1} max={10} className={`${field} w-24`} aria-label="Effort" value={d.effort} onChange={e => setD(x => ({ ...x, effort: e.target.value }))} /></label>
        </div>

        {showLifts && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Exercises</p>
            {d.exercises.map((ex, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input className={`${field} flex-1`} aria-label={`Exercise ${i + 1} name`} placeholder="Exercise, e.g. Bench press" maxLength={60} value={ex.name} onChange={e => setEx(i, { name: e.target.value })} />
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label={`Remove exercise ${i + 1}`} onClick={() => setD(x => ({ ...x, exercises: x.exercises.filter((_, j) => j !== i) }))}><Trash2 size={14} /></Button>
                </div>
                {ex.sets.map((s, k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-12 text-muted-foreground">Set {k + 1}</span>
                    <input type="number" min={0} className={`${field} w-20`} aria-label={`Exercise ${i + 1} set ${k + 1} reps`} placeholder="reps" value={s.reps} onChange={e => setEx(i, { sets: ex.sets.map((t, j) => (j === k ? { ...t, reps: e.target.value } : t)) })} />
                    <span className="text-muted-foreground">×</span>
                    <input type="number" min={0} step="0.5" className={`${field} w-24`} aria-label={`Exercise ${i + 1} set ${k + 1} weight`} placeholder={wUnit(units)} value={s.weight} onChange={e => setEx(i, { sets: ex.sets.map((t, j) => (j === k ? { ...t, weight: e.target.value } : t)) })} />
                    <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove set ${k + 1}`} onClick={() => setEx(i, { sets: ex.sets.filter((_, j) => j !== k) })}><Trash2 size={13} /></button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" disabled={ex.sets.length >= MAX_SETS} onClick={() => setEx(i, { sets: [...ex.sets, ex.sets.length ? { reps: ex.sets[ex.sets.length - 1].reps, weight: ex.sets[ex.sets.length - 1].weight } : { reps: '', weight: '' }] })}>Add set</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={d.exercises.length >= MAX_EXERCISES} onClick={() => setD(x => ({ ...x, exercises: [...x.exercises, { name: '', sets: [{ reps: '', weight: '' }] }] }))}><Plus size={14} /> Add exercise</Button>
          </div>
        )}

        <textarea className={`${field} w-full`} rows={2} maxLength={2000} aria-label="Notes" placeholder="Notes (optional)" value={d.notes} onChange={e => setD(x => ({ ...x, notes: e.target.value }))} />
        {problem && d.title !== '' && <p className="text-sm text-destructive" role="alert">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!!problem || saving} onClick={() => onSave(input)}>{saving ? 'Saving…' : 'Save workout'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function WorkoutRow({ w, units, onEdit, onDelete }: { w: Workout; units: Units; onEdit: () => void; onDelete: () => void }) {
  const volume = workoutVolumeKg(w)
  return (
    <li className="py-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{w.title}{w.source === 'assistant' && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">via chat</span>}</p>
          <p className="text-xs text-muted-foreground">{longDay(w.day)} · {w.kind}{w.minutes ? ` · ${w.minutes} min` : ''}{w.km ? ` · ${showD(w.km, units)} ${dUnit(units)}` : ''}{w.effort ? ` · effort ${w.effort}/10` : ''}{volume ? ` · ${fmt.format(Math.round(showW(volume, units)))} ${wUnit(units)} lifted` : ''}</p>
        </div>
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" aria-label={`Edit ${w.title}`} onClick={onEdit}><Pencil size={14} /></Button>
          <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${w.title}`} onClick={onDelete}><Trash2 size={14} /></Button>
        </div>
      </div>
      {w.exercises.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {w.exercises.map((e, i) => <li key={i}><span className="text-foreground">{e.name}</span> {e.sets.map(s => `${s.reps ?? '–'}${s.weightKg != null ? `×${showW(s.weightKg, units)}` : ''}`).join(', ')}</li>)}
        </ul>
      )}
      {w.notes && <p className="text-xs text-muted-foreground italic break-words">{w.notes}</p>}
    </li>
  )
}

// ------------------------------------------------------------------- panels

function TodayPanel({ o }: { o: Overview }) {
  const { saveSteps, saveMetric } = useFitnessMutations()
  const { toast } = useToast()
  const u = o.prefs.units
  const todayMetric = o.metrics.find(m => m.day === o.today)
  const [steps, setSteps] = useState('')
  const [m, setM] = useState({ weight: '', sleep: '', hr: '', waist: '', mood: '' })
  useEffect(() => {
    setM({
      weight: todayMetric?.weightKg != null ? String(showW(todayMetric.weightKg, u)) : '', sleep: todayMetric?.sleepHours?.toString() ?? '', hr: todayMetric?.restingHr?.toString() ?? '',
      waist: todayMetric?.waistCm?.toString() ?? '', mood: todayMetric?.mood?.toString() ?? '',
    })
  }, [todayMetric?.weightKg, todayMetric?.sleepHours, todayMetric?.restingHr, todayMetric?.waistCm, todayMetric?.mood, u])
  const todayStep = o.steps[o.steps.length - 1]
  const deviceSteps = todayStep?.source === 'device'

  const saveBody = () => {
    const values: Record<string, number | null> = {
      weightKg: num(m.weight) === null ? null : round(readW(num(m.weight)!, u), 1), sleepHours: num(m.sleep), restingHr: num(m.hr), waistCm: num(m.waist), mood: num(m.mood),
    }
    if (Object.values(values).every(v => v === null)) { toast({ title: 'Enter at least one value' }); return }
    saveMetric.mutate({ day: o.today, values }, { onSuccess: () => toast({ title: 'Saved' }) })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6">
            <Ring value={o.todaySteps} goal={o.prefs.stepGoal} size={104} label={fmt.format(o.todaySteps)} sub={`of ${fmt.format(o.prefs.stepGoal)} steps`} />
            <Ring value={o.week.count} goal={o.week.goal} size={104} label={`${o.week.count}/${o.week.goal}`} sub="workouts this week" />
            <div className="text-sm space-y-1 min-w-[10rem]">
              <p><span className="text-muted-foreground">7-day average</span> <b>{fmt.format(o.stepStats.avg7)}</b> steps</p>
              <p><span className="text-muted-foreground">Goal met</span> <b>{o.stepStats.goalDays7}</b> of the last 7 days</p>
              <p><span className="text-muted-foreground">Goal streak</span> <b>{o.stepStats.streak}</b> day{o.stepStats.streak === 1 ? '' : 's'}</p>
              <p><span className="text-muted-foreground">This week</span> <b>{o.week.minutes}</b> min{o.week.km ? ` · ${showD(o.week.km, u)} ${dUnit(u)}` : ''}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2"><Footprints size={18} /> Today’s steps</CardTitle>
          <CardDescription>{deviceSteps ? 'Counted by your phone or watch. Your own entry is kept but the device count is shown.' : 'Type your total, or sync from the Android app.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); const n = Number(steps); if (steps.trim() && Number.isFinite(n)) saveSteps.mutate({ day: o.today, steps: n }, { onSuccess: () => setSteps('') }) }}>
            <input type="number" min={0} className={`${field} w-40`} aria-label="Steps today" placeholder={String(o.todaySteps || '8000')} value={steps} onChange={e => setSteps(e.target.value)} />
            <Button type="submit" disabled={!steps.trim() || saveSteps.isPending}>Save steps</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2"><Activity size={18} /> Body today</CardTitle>
          <CardDescription>Fill in what you want to track. Empty boxes are skipped.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {([
              ['weight', `Weight (${wUnit(u)})`, '0.1'], ['sleep', 'Sleep (h)', '0.25'], ['hr', 'Resting HR', '1'], ['waist', 'Waist (cm)', '0.5'], ['mood', 'Mood (1-5)', '1'],
            ] as const).map(([k, label, step]) => (
              <label key={k} className="text-sm space-y-1"><span className="block text-muted-foreground">{label}</span>
                <input type="number" step={step} min={0} className={`${field} w-28`} aria-label={label} value={m[k]} onChange={e => setM(x => ({ ...x, [k]: e.target.value }))} /></label>
            ))}
          </div>
          <div className="flex justify-end"><Button onClick={saveBody} disabled={saveMetric.isPending}>Save</Button></div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProgressPanel({ o }: { o: Overview }) {
  const u = o.prefs.units
  const steps: Datum[] = o.steps.map(s => ({ key: s.day, label: shortDay(s.day), value: s.steps }))
  const weeks: Datum[] = o.weeks.map(w => ({ key: w.start, label: `Wk ${shortDay(w.start)}`, value: w.count }))
  const weight: Datum[] = o.weightTrend.map(p => ({ key: p.day, label: shortDay(p.day), value: showW(p.value, u) }))
  const series = (pick: (m: Overview['metrics'][number]) => number | null): Datum[] => o.metrics.filter(m => pick(m) != null).map(m => ({ key: m.day, label: shortDay(m.day), value: pick(m) as number }))
  const sleep = series(m => m.sleepHours)
  const hr = series(m => m.restingHr)
  const ch = o.weightChange30
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Steps, last {steps.length} days</CardTitle><CardDescription>Dashed line is your goal of {fmt.format(o.prefs.stepGoal)}. Best day: {o.stepStats.best ? `${fmt.format(o.stepStats.best.steps)} on ${shortDay(o.stepStats.best.day)}` : '—'}.</CardDescription></CardHeader>
        <CardContent><BarChart data={steps} goal={o.prefs.stepGoal} caption="Steps per day" format={v => `${fmt.format(v)} steps`} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Workouts per week</CardTitle><CardDescription>Goal: {o.week.goal} a week.</CardDescription></CardHeader>
        <CardContent><BarChart data={weeks} goal={o.week.goal} caption="Workouts per week" format={v => `${v} workout${v === 1 ? '' : 's'}`} height={80} /></CardContent>
      </Card>
      {weight.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg">Weight</CardTitle><CardDescription>7-day average{ch !== null ? ` · ${ch > 0 ? '+' : ''}${showW(Math.abs(ch), u) * (ch < 0 ? -1 : 1)} ${wUnit(u)} over the last 30 days` : ''}</CardDescription></CardHeader>
          <CardContent><LineChart data={weight} caption="Weight, 7-day average" unit={` ${wUnit(u)}`} /></CardContent>
        </Card>
      )}
      {sleep.length > 1 && <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Sleep</CardTitle></CardHeader><CardContent><LineChart data={sleep} caption="Hours slept" unit=" h" /></CardContent></Card>}
      {hr.length > 1 && <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Resting heart rate</CardTitle></CardHeader><CardContent><LineChart data={hr} caption="Resting heart rate" unit=" bpm" /></CardContent></Card>}
      {o.bests.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Trophy size={18} /> Personal bests</CardTitle><CardDescription>Your heaviest set for each exercise.</CardDescription></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="font-normal py-1">Exercise</th><th className="font-normal py-1 text-right">Best set</th><th className="font-normal py-1 text-right">Est. 1RM</th></tr></thead>
              <tbody>{o.bests.map(b => (
                <tr key={b.exercise} className="border-t border-border"><td className="py-1.5 break-words">{b.exercise}</td><td className="py-1.5 text-right tabular-nums">{b.reps} × {showW(b.weightKg, u)} {wUnit(u)}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{b.oneRepMax ? `${showW(b.oneRepMax, u)} ${wUnit(u)}` : '—'}</td></tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SettingsPanel({ prefs }: { prefs: FitnessPrefs }) {
  const { data: settings } = useSettings()
  const { mutate: save, isPending } = useUpdateSettings()
  const { toast } = useToast()
  const saved = normalizeFitnessPrefs(settings?.fitness)
  const [d, setD] = useState<FitnessPrefs>(saved)
  useEffect(() => { setD(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  void prefs
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Goals and units</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Daily steps goal</span><input type="number" min={500} className={`${field} w-32`} aria-label="Daily steps goal" value={d.stepGoal} onChange={e => setD(x => ({ ...x, stepGoal: Number(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Workouts per week</span><input type="number" min={1} max={14} className={`${field} w-28`} aria-label="Workouts per week goal" value={d.weeklyWorkouts} onChange={e => setD(x => ({ ...x, weeklyWorkouts: Number(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Units</span>
            <select className={field} aria-label="Units" value={d.units} onChange={e => setD(x => ({ ...x, units: e.target.value as Units }))}><option value="metric">Metric (kg, km)</option><option value="imperial">Imperial (lb, mi)</option></select></label>
        </div>
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setD(saved)}>Reset</Button>}
          <Button size="sm" disabled={!dirty || isPending} onClick={() => save({ fitness: normalizeFitnessPrefs(d) }, { onError: () => toast({ title: 'Couldn’t save', variant: 'destructive' }) })}>{isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DeviceCard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [connected, setConnected] = useState(healthConnected())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (healthSupported()) healthAvailability().then(a => !a.available && setNote(a.reason ?? null))
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['fitness'] })
    window.addEventListener(HEALTH_SYNCED, refresh)
    return () => window.removeEventListener(HEALTH_SYNCED, refresh)
  }, [queryClient])

  if (!healthSupported()) {
    return (
      <Card><CardHeader className="pb-2"><CardTitle className="text-lg">Phone and watch steps</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Websites can’t read step counts. Install the WinterArc Android app and connect Health Connect: steps from your phone, Fitbit, Garmin, Samsung and other watches that share with Health Connect then appear here automatically.</p>
          <p>Until then you can type your steps each day.</p>
        </CardContent></Card>
    )
  }
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (r.ok) { toast({ title: done }); setConnected(healthConnected()); queryClient.invalidateQueries({ queryKey: ['fitness'] }) }
    else toast({ title: 'Couldn’t sync', description: r.message, variant: 'destructive' })
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-lg">Phone and watch steps</CardTitle>
        <CardDescription>Reads your daily steps, weight and resting heart rate from Android Health Connect. Nothing is written back and nothing else is read.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Button className="gap-1.5" disabled={busy} onClick={() => run(() => syncHealth(30, true), 'Synced')}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Sync now</Button>
              <Button variant="ghost" onClick={() => { disconnectHealth(); setConnected(false) }}>Stop syncing</Button>
            </>
          ) : <Button disabled={busy} onClick={() => run(connectHealth, 'Connected')}>Connect Health Connect</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------- page

type Tab = 'today' | 'workouts' | 'progress'

export default function FitnessPage() {
  const { data: o, isLoading, error } = useFitness(30)
  const { saveWorkout, deleteWorkout } = useFitnessMutations()
  const [tab, setTab] = useState<Tab>('today')
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)

  useEffect(() => { void syncHealth() }, [])

  const units = o?.prefs.units ?? 'metric'
  const tabs: [Tab, string][] = [['today', 'Today'], ['workouts', 'Workouts'], ['progress', 'Progress']]

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Dumbbell className="text-primary" size={28} /> Fitness</h1>
            <p className="text-muted-foreground mt-1">Workouts, steps and how your body is trending.</p>
          </div>
          {o && !editing && <Button className="gap-1.5" onClick={() => { setTab('workouts'); setEditing({ id: null, draft: blankDraft(o.today) }) }}><Plus size={16} /> Log workout</Button>}
        </div>

        <div className="flex gap-1 border-b border-border" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive" role="alert">Couldn’t load your fitness data.</p>}

        {o && tab === 'today' && <TodayPanel o={o} />}
        {o && tab === 'progress' && <ProgressPanel o={o} />}
        {o && tab === 'workouts' && (
          <div className="space-y-4">
            {editing && (
              <WorkoutForm initial={editing.draft} units={units} saving={saveWorkout.isPending} onCancel={() => setEditing(null)}
                onSave={workout => saveWorkout.mutate({ id: editing.id, workout }, { onSuccess: () => setEditing(null) })} />
            )}
            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-lg">History</CardTitle></CardHeader>
              <CardContent>
                {o.workouts.length === 0 ? <p className="text-sm text-muted-foreground pt-3">No workouts yet. Log one above, or tell the chat what you did.</p> : (
                  <ul className="divide-y divide-border">
                    {o.workouts.map(w => (
                      <WorkoutRow key={w.id} w={w} units={units} onEdit={() => setEditing({ id: w.id, draft: fromWorkout(w, units) })}
                        onDelete={async () => { if (await confirmDialog({ title: `Delete “${w.title}”?`, description: 'This removes it from your history and progress.', confirmLabel: 'Delete', destructive: true })) deleteWorkout.mutate(w.id) }} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {o && <DeviceCard />}
        {o && <SettingsPanel prefs={o.prefs} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Log by chat</CardTitle>
            <CardDescription>Say what you did, like “ran 5k in 28 minutes, 9,200 steps, weigh 72.4”. It records it and shows you exactly what it saved. It isn’t a doctor: ask a professional about pain or medical questions.</CardDescription>
          </CardHeader>
          <CardContent><AssistantChat quick={CHAT_QUICK} scope="fitness" placeholder="What did you do today?" /></CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
