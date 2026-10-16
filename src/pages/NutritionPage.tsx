import { useEffect, useState } from 'react'
import { Apple, Pencil, Sparkles, Trash2 } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import AssistantChat, { type Quick } from '@/components/AssistantChat'
import { BarChart, Ring, type Datum } from '@/components/charts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useNutrition, useNutritionMutations, type Estimate, type Meal, type NutritionOverview } from '@/hooks/useNutrition'
import {
  GOAL_MODES, LOW_CALORIE_GOAL, MEAL_SLOTS, MIN_CALORIE_GOAL, mealProblem, normalizeGoals, roundMacros, sumMacros, type MealInput, type MealSlot, type NutritionGoals,
} from '@/shared/nutrition'

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const fmt = new Intl.NumberFormat('en')
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

const defaultSlot = (): MealSlot => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack' }

const CHAT_QUICK: Quick[] = [
  { label: 'What should I eat next?', prompt: 'Look at what I have eaten today and what I have left. Suggest what to eat next, using ordinary foods.' },
  { label: 'Log a meal', prompt: 'I just ate: ', focus: true },
  { label: 'Review my week', prompt: 'Review my eating this week against my goals. Be honest and practical, and suggest one or two changes.' },
  { label: 'High-protein snack ideas', prompt: 'Suggest three high-protein snacks that fit what I have left today.' },
]

// ------------------------------------------------------------------ forms

type Draft = { day: string; slot: MealSlot; text: string; calories: string; proteinG: string; carbsG: string; fatG: string }
const blank = (day: string): Draft => ({ day, slot: defaultSlot(), text: '', calories: '', proteinG: '', carbsG: '', fatG: '' })
const toMeal = (d: Draft): MealInput => ({ day: d.day, slot: d.slot, text: d.text.trim(), calories: num(d.calories), proteinG: num(d.proteinG) || 0, carbsG: num(d.carbsG) || 0, fatG: num(d.fatG) || 0, items: [] })

function MealForm({ initial, saving, onSave, onCancel }: { initial: Draft; saving: boolean; onSave: (m: MealInput) => void; onCancel: () => void }) {
  const [d, setD] = useState(initial)
  const meal = toMeal(d)
  const problem = mealProblem(meal)
  const n = (k: 'calories' | 'proteinG' | 'carbsG' | 'fatG', label: string, w = 'w-24') => (
    <label className="text-sm space-y-1"><span className="block text-muted-foreground">{label}</span>
      <input type="number" min={0} className={`${field} ${w}`} aria-label={label} value={d[k]} onChange={e => setD(x => ({ ...x, [k]: e.target.value }))} /></label>
  )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={field} aria-label="Meal" value={d.slot} onChange={e => setD(x => ({ ...x, slot: e.target.value as MealSlot }))}>{MEAL_SLOTS.map(s => <option key={s} value={s}>{cap(s)}</option>)}</select>
        <input type="date" className={field} aria-label="Date" value={d.day} onChange={e => setD(x => ({ ...x, day: e.target.value }))} />
      </div>
      <input className={`${field} w-full`} aria-label="What you ate" placeholder="What did you eat?" maxLength={300} value={d.text} onChange={e => setD(x => ({ ...x, text: e.target.value }))} />
      <div className="flex flex-wrap gap-3">{n('calories', 'Calories')}{n('proteinG', 'Protein (g)')}{n('carbsG', 'Carbs (g)')}{n('fatG', 'Fat (g)')}</div>
      {problem && d.text !== '' && <p className="text-sm text-destructive" role="alert">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!!problem || saving} onClick={() => onSave(meal)}>{saving ? 'Saving…' : 'Save meal'}</Button>
      </div>
    </div>
  )
}

/** The AI's estimate, laid out so every number can be corrected before it is saved. */
function EstimateReview({ text, estimate, day, saving, onSave, onCancel }: { text: string; estimate: Estimate; day: string; saving: boolean; onSave: (m: MealInput) => void; onCancel: () => void }) {
  const [slot, setSlot] = useState<MealSlot>(defaultSlot())
  const [items, setItems] = useState(estimate.items)
  const total = roundMacros(sumMacros(items))
  const meal: MealInput = { day, slot, text: text.trim().slice(0, 300), ...total, items }
  const problem = mealProblem(meal)
  const set = (i: number, k: 'name' | 'calories' | 'proteinG' | 'carbsG' | 'fatG', v: string) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, [k]: k === 'name' ? v : Number(v) || 0 } : x)))
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 p-3">
      <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles size={14} className="text-primary" /> Estimate. Check it and correct anything that looks off.</p>
      {estimate.note && <p className="text-xs text-muted-foreground">{estimate.note}</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <input className={`${field} flex-1 min-w-[8rem]`} aria-label={`Item ${i + 1} name`} value={it.name} onChange={e => set(i, 'name', e.target.value)} />
            {(['calories', 'proteinG', 'carbsG', 'fatG'] as const).map(k => (
              <input key={k} type="number" min={0} className={`${field} w-[4.5rem]`} aria-label={`Item ${i + 1} ${k === 'calories' ? 'calories' : k.replace('G', '')}`} title={k === 'calories' ? 'kcal' : `${k.replace('G', '')} (g)`} value={it[k]} onChange={e => set(i, k, e.target.value)} />
            ))}
            <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">kcal · protein g · carbs g · fat g</p>
      </div>
      <p className="text-sm" aria-live="polite"><b>{fmt.format(total.calories)}</b> kcal · P {total.proteinG} g · C {total.carbsG} g · F {total.fatG} g</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} aria-label="Meal" value={slot} onChange={e => setSlot(e.target.value as MealSlot)}>{MEAL_SLOTS.map(s => <option key={s} value={s}>{cap(s)}</option>)}</select>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>Discard</Button>
        <Button disabled={!!problem || saving || items.length === 0} onClick={() => onSave(meal)}>{saving ? 'Saving…' : 'Save meal'}</Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ panels

function Bar({ label, value, goal, unit }: { label: string; value: number; goal: number | null; unit: string }) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span>{label}</span><span className="text-muted-foreground tabular-nums">{value}{goal ? ` / ${goal}` : ''} {unit}</span></div>
      <div className="h-1.5 rounded bg-secondary overflow-hidden" role="img" aria-label={goal ? `${label}: ${value} of ${goal} ${unit}` : `${label}: ${value} ${unit}`}><div className="h-full bg-primary" style={{ width: goal ? `${pct}%` : '0%' }} /></div>
    </div>
  )
}

function TodayCard({ o }: { o: NutritionOverview }) {
  const left = o.remaining.calories
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-6">
          <Ring value={o.eaten.calories} goal={o.goals.calories} size={112} label={fmt.format(o.eaten.calories)} sub={`of ${fmt.format(o.goals.calories)} kcal`} />
          <div className="flex-1 min-w-[12rem] space-y-2">
            <p className="text-sm">{left >= 0 ? <><b>{fmt.format(left)}</b> kcal left today</> : <><b>{fmt.format(-left)}</b> kcal over today’s goal</>}</p>
            <Bar label="Protein" value={o.eaten.proteinG} goal={o.goals.proteinG} unit="g" />
            <Bar label="Carbs" value={o.eaten.carbsG} goal={o.goals.carbsG} unit="g" />
            <Bar label="Fat" value={o.eaten.fatG} goal={o.goals.fatG} unit="g" />
            <p className="text-xs text-muted-foreground">Logged {o.streak} day{o.streak === 1 ? '' : 's'} in a row · average on days you log: {fmt.format(o.average.calories)} kcal</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GoalsCard({ goals }: { goals: NutritionGoals }) {
  const { data: settings } = useSettings()
  const { mutate: save, isPending } = useUpdateSettings()
  const { toast } = useToast()
  const saved = normalizeGoals(settings?.nutrition ?? goals)
  const [d, setD] = useState<NutritionGoals>(saved)
  useEffect(() => { setD(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const optional = (v: string) => (v.trim() === '' ? null : Number(v))
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Goals and food notes</CardTitle><CardDescription>The advisor uses these. A calorie goal can’t be set below {fmt.format(MIN_CALORIE_GOAL)}.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Calories / day</span><input type="number" min={MIN_CALORIE_GOAL} className={`${field} w-28`} aria-label="Calorie goal" value={d.calories} onChange={e => setD(x => ({ ...x, calories: Number(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Protein (g)</span><input type="number" min={0} className={`${field} w-24`} aria-label="Protein goal" value={d.proteinG} onChange={e => setD(x => ({ ...x, proteinG: Number(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Carbs (g, optional)</span><input type="number" min={0} className={`${field} w-28`} aria-label="Carbs goal" value={d.carbsG ?? ''} onChange={e => setD(x => ({ ...x, carbsG: optional(e.target.value) }))} /></label>
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Fat (g, optional)</span><input type="number" min={0} className={`${field} w-28`} aria-label="Fat goal" value={d.fatG ?? ''} onChange={e => setD(x => ({ ...x, fatG: optional(e.target.value) }))} /></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm space-y-1"><span className="block text-muted-foreground">Aim</span>
            <select className={field} aria-label="Aim" value={d.mode} onChange={e => setD(x => ({ ...x, mode: e.target.value as NutritionGoals['mode'] }))}>{GOAL_MODES.map(m => <option key={m} value={m}>{{ none: 'No particular aim', lose: 'Lose weight gradually', maintain: 'Maintain weight', gain: 'Build muscle / gain' }[m]}</option>)}</select></label>
          <label className="text-sm space-y-1 flex-1 min-w-[10rem]"><span className="block text-muted-foreground">Way of eating</span><input className={`${field} w-full`} aria-label="Way of eating" placeholder="e.g. vegetarian, halal" maxLength={80} value={d.diet} onChange={e => setD(x => ({ ...x, diet: e.target.value }))} /></label>
        </div>
        <label className="text-sm space-y-1 block"><span className="block text-muted-foreground">Allergies and foods to avoid</span><input className={`${field} w-full`} aria-label="Foods to avoid" placeholder="e.g. peanuts, shellfish, lactose" maxLength={200} value={d.avoid} onChange={e => setD(x => ({ ...x, avoid: e.target.value }))} /></label>
        {d.calories < LOW_CALORIE_GOAL && <p className="text-sm text-amber-600 dark:text-amber-400" role="status">That’s a low target. Very low calorie goals can be unsafe: please talk to a doctor or dietitian before eating this little.</p>}
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => setD(saved)}>Reset</Button>}
          <Button size="sm" disabled={!dirty || isPending} onClick={() => save({ nutrition: normalizeGoals(d) }, { onError: () => toast({ title: 'Couldn’t save', variant: 'destructive' }) })}>{isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function NutritionPage() {
  const { data: o, isLoading, error } = useNutrition(14)
  const { saveMeal, deleteMeal, estimate } = useNutritionMutations()
  const { toast } = useToast()
  const [mode, setMode] = useState<'describe' | 'manual'>('describe')
  const [text, setText] = useState('')
  const [review, setReview] = useState<{ text: string; estimate: Estimate } | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [aiOff, setAiOff] = useState(false)

  const runEstimate = () => {
    if (text.trim().length < 2) return
    estimate.mutate(text, {
      onSuccess: e => setReview({ text, estimate: e }),
      onError: (e: Error & { code?: string }) => {
        if (e.code === 'ai_unconfigured') setAiOff(true)
        toast({ title: e.code === 'ai_unconfigured' ? 'Estimates aren’t switched on' : 'Couldn’t estimate that', description: e.code === 'ai_unconfigured' ? 'Add the meal by hand instead.' : e.message, variant: 'destructive' })
      },
    })
  }
  const caloriesData: Datum[] = (o?.days ?? []).map(d => ({ key: d.day, label: shortDay(d.day), value: d.calories }))
  const bySlot = (slot: MealSlot) => (o?.todayMeals ?? []).filter(m => m.slot === slot)
  const draftOf = (m: Meal): Draft => ({ day: m.day, slot: m.slot, text: m.text, calories: String(m.calories), proteinG: String(m.proteinG), carbsG: String(m.carbsG), fatG: String(m.fatG) })

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Apple className="text-primary" size={28} /> Nutrition</h1>
          <p className="text-muted-foreground mt-1">Log what you eat, see it against your goals, and ask for food advice. Numbers are estimates, and this is general guidance, not medical advice.</p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive" role="alert">Couldn’t load your nutrition data.</p>}

        {o && <TodayCard o={o} />}

        {o && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Add a meal</CardTitle>
              <div className="flex gap-1 pt-1" role="tablist">
                {([['describe', 'Describe it'], ['manual', 'Enter numbers']] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={mode === id} onClick={() => { setMode(id); setReview(null); setEditing(null) }}
                    className={`px-3 py-1.5 text-sm rounded-md ${mode === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>{label}</button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mode === 'describe' && !review && (
                <>
                  <textarea className={`${field} w-full`} rows={2} maxLength={600} aria-label="Describe your meal" placeholder="e.g. two fried eggs on toast and a coffee with milk" value={text} onChange={e => setText(e.target.value)} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{aiOff ? 'Estimates are off on this server. Use “Enter numbers”.' : 'An AI estimates calories and macros. You can correct them before saving.'}</p>
                    <Button className="gap-1.5" disabled={estimate.isPending || text.trim().length < 2 || aiOff} onClick={runEstimate}><Sparkles size={14} /> {estimate.isPending ? 'Estimating…' : 'Estimate'}</Button>
                  </div>
                </>
              )}
              {mode === 'describe' && review && (
                <EstimateReview text={review.text} estimate={review.estimate} day={o.today} saving={saveMeal.isPending} onCancel={() => setReview(null)}
                  onSave={meal => saveMeal.mutate({ id: null, meal, source: 'estimate' }, { onSuccess: () => { setReview(null); setText('') } })} />
              )}
              {mode === 'manual' && <MealForm key={editing?.id ?? 'new'} initial={editing?.draft ?? blank(o.today)} saving={saveMeal.isPending} onCancel={() => setEditing(null)}
                onSave={meal => saveMeal.mutate({ id: editing?.id ?? null, meal }, { onSuccess: () => setEditing(null) })} />}
              {o.recent.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Have it again (adds to today)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {o.recent.slice(0, 8).map(m => (
                      <button key={m.id} type="button" className="px-2.5 py-1 rounded-full border border-border text-xs hover:border-primary max-w-full truncate" title={`${m.text} · ${m.calories} kcal`}
                        onClick={() => saveMeal.mutate({ id: null, meal: { day: o.today, slot: defaultSlot(), text: m.text, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, items: m.items } }, { onSuccess: () => toast({ title: `Added “${m.text.slice(0, 40)}”` }) })}>
                        + {m.text.length > 28 ? `${m.text.slice(0, 28)}…` : m.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {o && (
          <Card>
            <CardHeader className="pb-0"><CardTitle className="text-lg">Today’s meals</CardTitle></CardHeader>
            <CardContent>
              {o.todayMeals.length === 0 ? <p className="text-sm text-muted-foreground pt-3">Nothing logged yet today.</p> : (
                <div className="divide-y divide-border">
                  {MEAL_SLOTS.map(slot => bySlot(slot).length > 0 && (
                    <div key={slot} className="py-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{slot}</p>
                      <ul className="space-y-1.5">
                        {bySlot(slot).map(m => (
                          <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <p className="break-words">{m.text}{m.source !== 'manual' && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{m.source === 'assistant' ? 'via chat' : 'estimated'}</span>}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{fmt.format(m.calories)} kcal · P {m.proteinG} · C {m.carbsG} · F {m.fatG}</p>
                            </div>
                            <div className="flex shrink-0">
                              <Button size="sm" variant="ghost" aria-label={`Edit ${m.text}`} onClick={() => { setMode('manual'); setReview(null); setEditing({ id: m.id, draft: draftOf(m) }) }}><Pencil size={14} /></Button>
                              <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${m.text}`} onClick={async () => { if (await confirmDialog({ title: `Delete “${m.text.slice(0, 40)}”?`, description: 'This removes it from today’s totals.', confirmLabel: 'Delete', destructive: true })) deleteMeal.mutate(m.id) }}><Trash2 size={14} /></Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {o && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Calories, last 14 days</CardTitle>
              <CardDescription>Dashed line is your goal. Days with nothing logged show as empty, not zero calories.</CardDescription></CardHeader>
            <CardContent><BarChart data={caloriesData} goal={o.goals.calories} caption="Calories per day" format={v => `${fmt.format(v)} kcal`} /></CardContent>
          </Card>
        )}

        {o && <GoalsCard goals={o.goals} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Food advisor</CardTitle>
            <CardDescription>Ask what to eat, log meals by chat, or have your week reviewed. It knows your goals and foods to avoid. It is not a doctor or dietitian.</CardDescription>
          </CardHeader>
          <CardContent><AssistantChat quick={CHAT_QUICK} scope="nutrition" placeholder="Ask about food, or tell me what you ate…" /></CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
