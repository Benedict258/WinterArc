import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Code2, Clapperboard, Dumbbell, FileText, GraduationCap, Snowflake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BlockEditor from '@/components/BlockEditor'
import { useAuth } from '@/context/AuthContext'
import { TEMPLATES, PRESETS, getTemplate, type PresetId, type TemplateThread } from '@/shared/templates'
import { blocksProblem, blockRange, type DayBlock } from '@/shared/dayBlocks'
import { detectTimezone, timezoneList } from '@/lib/timezones'

const ICONS: Record<string, typeof FileText> = { GraduationCap, Code2, Dumbbell, Clapperboard, FileText }
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


function describe(t: TemplateThread) {
  if (t.taskMode === 'event') return `${t.eventDays?.map(d => DAY[d]).join(', ')} ${t.eventStart}–${t.eventEnd}`
  if (t.frequency === 'fixed-day') return `Every ${DAY[t.fixedDay ?? 0]}`
  return { daily: 'Daily', multiple: 'A few times a week', weekly: 'Weekly', 'fixed-day': '' }[t.frequency]
}

/** First-run setup: pick a starter pack, adjust it, start planning. */
export default function OnboardingPage() {
  const { user, refreshUser, logout } = useAuth()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [templateId, setTemplateId] = useState<string>('')
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [blocks, setBlocks] = useState<DayBlock[]>([])
  const [preset, setPreset] = useState<PresetId>('balanced')
  const [timezone, setTimezone] = useState(detectTimezone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const template = getTemplate(templateId)
  const tzList = useMemo(() => timezoneList(timezone), [timezone])

  const choose = (id: string) => {
    const t = getTemplate(id)!
    setTemplateId(id)
    setKept(new Set(t.threads.filter(x => !x.optional).map(x => x.key)))
    setBlocks(t.blocks.map(b => ({ ...b, weights: { ...b.weights } })))
    setPreset(t.preset)
    setStep(1)
  }

  const submit = async (body: object) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      // 409 means setup was already completed (another tab or device): just carry on
      if (!res.ok && res.status !== 409) throw new Error((await res.json().catch(() => ({}))).error || 'Something went wrong')
      await queryClient.invalidateQueries()
      await refreshUser()
    } catch (e) {
      setError(!navigator.onLine || e instanceof TypeError ? 'You are offline. Connect to the internet to finish setup.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const finish = () => submit({ templateId, threads: [...kept], blocks, preset, timezone })
  const skip = () => submit({ templateId: 'blank', timezone })

  const stepTitle = ['Choose a starting point', 'Your threads and day', 'How full should days be?'][step]

  return (
    <div className="min-h-screen w-full flex justify-center p-4 sm:p-8 bg-background text-foreground">
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary"><Snowflake size={22} /><span className="font-semibold">WinterArc</span></div>
          <button onClick={() => logout()} className="text-xs text-muted-foreground hover:underline">Sign out</button>
        </header>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Step {step + 1} of 3 · {user?.email}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{stepTitle}</h1>
          {step === 0 && <p className="text-sm text-muted-foreground mt-1">Pick a pack. You can change everything afterwards, and nothing here is permanent.</p>}
        </div>

        {step === 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {TEMPLATES.map(t => {
                const Icon = ICONS[t.icon] ?? FileText
                return (
                  <button key={t.id} onClick={() => choose(t.id)} className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary transition-colors space-y-2">
                    <div className="flex items-center gap-2"><Icon size={18} className="text-primary" /><span className="font-semibold">{t.name}</span></div>
                    <p className="text-sm text-muted-foreground">{t.tagline}</p>
                    <p className="text-xs text-muted-foreground">{t.threads.length ? `${t.threads.length} threads` : 'No threads'} · {t.blocks.length} blocks a day</p>
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tz" className="block text-xs font-medium text-muted-foreground">Your time zone (your day starts and ends here)</label>
              <select id="tz" value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm bg-background border-border">
                {tzList.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </>
        )}

        {step === 1 && template && (
          <div className="space-y-6">
            {template.threads.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Threads to start with</h2>
                <p className="text-xs text-muted-foreground">Threads are the ongoing things you work on. The planner spreads them across your week.</p>
                {template.threads.map(t => (
                  <label key={t.key} className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={kept.has(t.key)}
                      onChange={() => setKept(prev => { const n = new Set(prev); n.has(t.key) ? n.delete(t.key) : n.add(t.key); return n })}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{describe(t)} · {t.intensity} · {t.priority} priority</span>
                      {t.notes && <span className="block text-xs text-muted-foreground mt-0.5">{t.notes}</span>}
                    </span>
                  </label>
                ))}
              </section>
            )}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Your day</h2>
              <p className="text-xs text-muted-foreground">Split your day into 2 to 6 blocks. Heavy work goes where you choose "Heavy work".</p>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            </section>
          </div>
        )}

        {step === 2 && template && (
          <div className="space-y-6">
            <div className="grid gap-3">
              {(Object.keys(PRESETS) as PresetId[]).map(id => (
                <button
                  key={id}
                  onClick={() => setPreset(id)}
                  aria-pressed={preset === id}
                  className={`text-left p-4 rounded-xl border bg-card transition-colors ${preset === id ? 'border-primary' : 'border-border hover:border-primary/60'}`}
                >
                  <div className="flex items-center justify-between"><span className="font-semibold">{PRESETS[id].label}</span>{preset === id && <Check size={16} className="text-primary" />}</div>
                  <p className="text-sm text-muted-foreground">{PRESETS[id].blurb}</p>
                </button>
              ))}
            </div>
            <div className="p-4 rounded-xl border border-border bg-card text-sm space-y-1">
              <p className="font-medium">Summary</p>
              <p className="text-muted-foreground">{template.name} · {kept.size} thread{kept.size === 1 ? '' : 's'} · {PRESETS[preset].label} days · {timezone}</p>
              <p className="text-muted-foreground">{blocks.map((b, i) => `${b.label} ${blockRange(blocks, i)}`).join(' · ')}</p>
              <p className="text-xs text-muted-foreground pt-1">You can turn on reminders later in Settings.</p>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <footer className="flex items-center justify-between gap-3 pt-2">
          <div>
            {step > 0
              ? <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={16} className="mr-1" /> Back</Button>
              : null}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={skip} disabled={busy} className="text-sm text-muted-foreground hover:underline disabled:opacity-50">Skip, start blank</button>
            {step === 1 && <Button onClick={() => setStep(2)} disabled={!!blocksProblem(blocks)}>Next <ArrowRight size={16} className="ml-1" /></Button>}
            {step === 2 && <Button onClick={finish} disabled={busy}>{busy ? 'Setting up…' : 'Start planning'}</Button>}
          </div>
        </footer>
      </div>
    </div>
  )
}
