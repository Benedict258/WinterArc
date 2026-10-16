import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, RotateCcw, SkipForward, Timer, Trash2 } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useTasks } from '@/hooks/useTasks'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { FOCUS_LOGGED } from '@/lib/focusTimer'
import { formatClock, normalizeFocusPrefs, phaseMs, type FocusPrefs, type Phase } from '@/shared/focus'

type Summary = {
  todayMinutes: number; todayRounds: number; weekMinutes: number; streak: number
  week: { day: string; minutes: number; rounds: number }[]
  recent: { id: string; startedAt: string; minutes: number; label: string }[]
}

const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }
const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)

function PrefsCard() {
  const { data: settings } = useSettings()
  const { mutate: save, isPending } = useUpdateSettings()
  const { toast } = useToast()
  const saved = normalizeFocusPrefs(settings?.focus)
  const [draft, setDraft] = useState<FocusPrefs>(saved)
  useEffect(() => { setDraft(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const num = (key: 'focusMin' | 'shortMin' | 'longMin' | 'longEvery', label: string) => (
    <label className="text-sm space-y-1">
      <span className="block text-muted-foreground">{label}</span>
      <input type="number" min={1} className={`${field} w-24`} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))} />
    </label>
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Timer settings</CardTitle>
        <CardDescription>Applies to the next round. A round that is running keeps its length.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          {num('focusMin', 'Focus (min)')}{num('shortMin', 'Short break (min)')}{num('longMin', 'Long break (min)')}{num('longEvery', 'Long break after (rounds)')}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={draft.autoStart} onChange={e => setDraft(d => ({ ...d, autoStart: e.target.checked }))} /> Start the next round automatically</label>
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setDraft(saved)}>Reset</Button>}
          <Button size="sm" disabled={!dirty || isPending} onClick={() => save({ focus: normalizeFocusPrefs(draft) }, { onError: () => toast({ title: 'Couldn’t save', variant: 'destructive' }) })}>{isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function FocusPage() {
  const { state, remaining, prefs, pending, actions } = useFocusTimer()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: tasks = [] } = useTasks({ date: todayKey() })
  const { data: summary } = useQuery({
    queryKey: ['focus-summary'],
    queryFn: async () => { const r = await fetch('/api/focus/summary', { credentials: 'include' }); if (!r.ok) throw new Error('summary'); return (await r.json()) as Summary },
    refetchInterval: 120_000,
  })
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['focus-summary'] })
    window.addEventListener(FOCUS_LOGGED, refresh)
    return () => window.removeEventListener(FOCUS_LOGGED, refresh)
  }, [queryClient])

  const open = useMemo(() => (tasks as any[]).filter(t => t.status === 'pending' && !t.isEvent), [tasks])
  const total = phaseMs(state.phase, prefs)
  const progress = total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0
  const running = state.status === 'running'
  const fresh = state.status === 'idle' && remaining === total
  const maxDay = Math.max(1, ...(summary?.week.map(d => d.minutes) ?? [1]))

  const removeSession = async (id: string) => {
    const r = await fetch(`/api/focus/sessions/${id}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) queryClient.invalidateQueries({ queryKey: ['focus-summary'] })
    else toast({ title: 'Couldn’t remove that', variant: 'destructive' })
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Timer className="text-primary" size={28} /> Focus</h1>
          <p className="text-muted-foreground mt-1">Work in rounds with short breaks. Finished rounds are saved to your history.</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-5 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground" aria-live="polite">{PHASE_LABEL[state.phase]}{state.phase === 'focus' && ` · round ${(state.focusDone % prefs.longEvery) + 1} of ${prefs.longEvery}`}</p>
            <p className="text-7xl sm:text-8xl font-mono font-bold tabular-nums" role="timer" aria-label={`${formatClock(remaining)} left`}>{formatClock(remaining)}</p>
            <div className="h-2 rounded bg-secondary overflow-hidden"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>

            {state.phase === 'focus' && (
              <label className="block text-sm text-left space-y-1">
                <span className="text-muted-foreground">Working on (optional)</span>
                <select className={`${field} w-full`} value={state.taskId ?? ''} disabled={running}
                  onChange={e => { const t = open.find((x: any) => x._id === e.target.value); actions.setTask(t ? t._id : null, t ? t.title : '') }}>
                  <option value="">Nothing in particular</option>
                  {open.map((t: any) => <option key={t._id} value={t._id}>{t.title}</option>)}
                </select>
              </label>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {running
                ? <Button size="lg" onClick={() => actions.pause()} className="gap-2"><Pause size={18} /> Pause</Button>
                : <Button size="lg" onClick={() => actions.start()} className="gap-2"><Play size={18} /> {fresh ? 'Start' : 'Resume'}</Button>}
              <Button size="lg" variant="outline" onClick={() => actions.reset()} disabled={fresh} className="gap-2"><RotateCcw size={18} /> Reset</Button>
              <Button size="lg" variant="ghost" onClick={() => actions.skip()} className="gap-2" title={state.phase === 'focus' ? 'Skip this round (it is not saved)' : 'Skip the break'}><SkipForward size={18} /> Skip</Button>
            </div>
            {pending > 0 && <p className="text-xs text-muted-foreground">{pending} finished round{pending > 1 ? 's' : ''} will be saved when you are back online.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Your focus time</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl font-bold">{hm(summary?.todayMinutes ?? 0)}</p><p className="text-xs text-muted-foreground">today · {summary?.todayRounds ?? 0} rounds</p></div>
              <div><p className="text-2xl font-bold">{hm(summary?.weekMinutes ?? 0)}</p><p className="text-xs text-muted-foreground">last 7 days</p></div>
              <div><p className="text-2xl font-bold">{summary?.streak ?? 0}</p><p className="text-xs text-muted-foreground">day streak</p></div>
            </div>
            <div className="flex items-end gap-1.5 h-24" aria-label="Focus minutes each day this week">
              {(summary?.week ?? []).map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${d.day}: ${d.minutes} min`}>
                  <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(d.minutes ? 6 : 2, (d.minutes / maxDay) * 100)}%`, opacity: d.minutes ? 1 : 0.25 }} />
                  <span className="text-[10px] text-muted-foreground">{new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}</span>
                </div>
              ))}
            </div>
            {summary && summary.recent.length > 0 && (
              <ul className="divide-y divide-border text-sm">
                {summary.recent.slice(0, 8).map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{s.label || 'Focus round'} <span className="text-muted-foreground">· {s.minutes}m · {new Date(s.startedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></span>
                    <button className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove this round" onClick={() => removeSession(s.id)}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <PrefsCard />
      </div>
    </MainLayout>
  )
}
