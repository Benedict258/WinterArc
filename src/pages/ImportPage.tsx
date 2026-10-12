import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, FileUp } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  buildRows, detectSource, guessMapping, parseChecklist, parseCsv, NO_COLUMN,
  type BuildResult, type DateOrder, type ImportRow, type Mapping, type Source,
} from '@/shared/importParse'

type Tab = 'csv' | 'todoist' | 'notion' | 'winterarc'
type Summary = { created: number; duplicates: number; invalid: number; threadsCreated: number; newThreads: string[]; goalsCreated?: number; wishlistCreated?: number }

const TABS: { id: Tab; label: string; how: string; accept: string }[] = [
  { id: 'csv', label: 'CSV / spreadsheet', how: 'Export your sheet as CSV (Google Sheets: File → Download → CSV; Excel: Save As → CSV). The first row should be column names.', accept: '.csv,.tsv,.txt' },
  { id: 'todoist', label: 'Todoist', how: 'In Todoist open a project, then ⋯ → Export as CSV. Upload one file per project; the project name becomes a thread if you tick “create threads”.', accept: '.csv' },
  { id: 'notion', label: 'Notion', how: 'For a database: ⋯ → Export → CSV. For a page with checkboxes: Export → Markdown, or paste the text below. Notion’s own sign-in import isn’t available yet.', accept: '.csv,.md,.markdown,.txt' },
  { id: 'winterarc', label: 'WinterArc export', how: 'In the other WinterArc: Settings → Export All Data. Upload that file here. Threads, tasks, goals and wishlist come across; calendar links and auto-made placeholders don’t.', accept: '.json' },
]

const COLUMNS: { key: keyof Mapping; label: string; help?: string }[] = [
  { key: 'title', label: 'Task title' },
  { key: 'dueDate', label: 'Due date', help: 'the planner starts placing it a few days before' },
  { key: 'date', label: 'Day to do it', help: 'puts it straight on that day' },
  { key: 'status', label: 'Done?' },
  { key: 'priority', label: 'Priority' },
  { key: 'intensity', label: 'Intensity' },
  { key: 'thread', label: 'Thread' },
]

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'
const MAX_BYTES = 5 * 1024 * 1024
const CHUNK = 1000

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

const sum = (a: Summary, b: Summary): Summary => ({
  created: a.created + b.created, duplicates: a.duplicates + b.duplicates, invalid: a.invalid + b.invalid, threadsCreated: Math.max(a.threadsCreated, b.threadsCreated),
  newThreads: [...new Set([...a.newThreads, ...b.newThreads])],
})

export default function ImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('csv')
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<string[][] | null>(null)
  const [checklist, setChecklist] = useState('')
  const [bullets, setBullets] = useState(false)
  const [headingsAsThreads, setHeadingsAsThreads] = useState(true)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [source, setSource] = useState<Source>('generic')
  const [dateOrder, setDateOrder] = useState<DateOrder>('mdy')
  const [createThreads, setCreateThreads] = useState(true)
  const [defaultThread, setDefaultThread] = useState('')
  const [waText, setWaText] = useState<string | null>(null)
  const [preview, setPreview] = useState<Summary | null>(null)
  const [result, setResult] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = TABS.find(t => t.id === tab)!
  const textMode = tab === 'notion' && !table && !waText

  const reset = () => { setFileName(''); setTable(null); setMapping(null); setWaText(null); setPreview(null); setResult(null); setError('') }
  const choose = (t: Tab) => { setTab(t); reset(); setChecklist('') }

  const built: BuildResult | null = useMemo(() => {
    if (tab === 'winterarc') return null
    if (table && mapping) return buildRows(table, mapping, { source, dateOrder, defaultThread: defaultThread.trim() || undefined })
    if (checklist.trim() && !table) return parseChecklist(checklist, { plainBullets: bullets, headingsAsThreads })
    return null
  }, [tab, table, mapping, source, dateOrder, defaultThread, checklist, bullets, headingsAsThreads])

  const waCounts = useMemo(() => {
    if (!waText) return null
    try {
      const d = JSON.parse(waText)
      return { threads: d.threads?.length ?? 0, tasks: d.tasks?.length ?? 0, goals: d.goals?.length ?? 0, wishlist: d.wishlist?.length ?? 0 }
    } catch { return null }
  }, [waText])

  const onFile = async (file: File | undefined) => {
    reset()
    if (!file) return
    if (file.size > MAX_BYTES) { setError('That file is over 5 MB. Split it and import the parts.'); return }
    setFileName(file.name)
    const text = await file.text()
    if (tab === 'winterarc') {
      try { JSON.parse(text) } catch { setError('That doesn’t look like a WinterArc export (it isn’t valid JSON).'); return }
      setWaText(text)
      return
    }
    if (/\.(md|markdown)$/i.test(file.name) || (tab === 'notion' && !/\.csv$/i.test(file.name))) { setChecklist(text); return }
    const parsed = parseCsv(text)
    if (parsed.length < 2) { setError('I couldn’t find any rows in that file.'); return }
    const detected = tab === 'todoist' ? 'todoist' : tab === 'notion' ? 'notion' : detectSource(parsed[0])
    setSource(detected)
    setTable(parsed)
    setMapping(guessMapping(parsed[0]))
    if (tab === 'todoist') setDefaultThread(file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 100))
  }

  const rows: ImportRow[] = built?.rows ?? []

  const run = async (dryRun: boolean) => {
    setBusy(true)
    setError('')
    try {
      let total: Summary = { created: 0, duplicates: 0, invalid: 0, threadsCreated: 0, newThreads: [] }
      if (tab === 'winterarc') {
        const res = await post<Summary>(`/api/import/winterarc${dryRun ? '?dryRun=1' : ''}`, waText!)
        if (!res.ok) throw new Error(res.status === 413 ? 'That file is too large to import in one go.' : res.data.error || 'Import failed')
        total = res.data
      } else {
        for (let i = 0; i < rows.length; i += CHUNK) {
          const res = await post<Summary>('/api/import/tasks', { rows: rows.slice(i, i + CHUNK), createThreads, dryRun })
          if (!res.ok) throw new Error(res.data.error || 'Import failed')
          total = sum(total, res.data)
        }
      }
      if (dryRun) setPreview(total)
      else {
        setResult(total)
        await queryClient.invalidateQueries()
        window.dispatchEvent(new Event('winterarc-data-changed'))
      }
    } catch (e) {
      setError(!navigator.onLine || e instanceof TypeError ? 'You’re offline. Connect to the internet to import.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ready = tab === 'winterarc' ? !!waCounts : rows.length > 0

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Settings</Link>
          <h1 className="text-3xl sm:text-4xl font-bold mt-1">Import</h1>
          <p className="text-muted-foreground mt-1">Bring your tasks from another app. You’ll see exactly what will happen before anything is added, and importing a file twice doesn’t duplicate anything.</p>
        </div>

        <div role="tablist" className="flex flex-wrap gap-2">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => choose(t.id)} className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}>{t.label}</button>
          ))}
        </div>

        {result ? (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Check className="text-emerald-500" /> Imported</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><b>{result.created}</b> task{result.created === 1 ? '' : 's'} added{result.threadsCreated ? `, ${result.threadsCreated} new thread${result.threadsCreated === 1 ? '' : 's'}` : ''}{result.goalsCreated ? `, ${result.goalsCreated} goal${result.goalsCreated === 1 ? '' : 's'}` : ''}{result.wishlistCreated ? `, ${result.wishlistCreated} wishlist item${result.wishlistCreated === 1 ? '' : 's'}` : ''}.</p>
              {result.duplicates > 0 && <p className="text-muted-foreground">{result.duplicates} already existed and were skipped.</p>}
              {result.invalid > 0 && <p className="text-muted-foreground">{result.invalid} row{result.invalid === 1 ? '' : 's'} couldn’t be read and were skipped.</p>}
              <div className="flex gap-2 pt-1">
                <Button onClick={() => navigate('/backlog')}>See your backlog</Button>
                <Button variant="outline" onClick={() => { reset(); setChecklist('') }}>Import another file</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>1. Choose a file</CardTitle>
                <CardDescription>{current.how}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-3 p-4 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary text-sm">
                  <FileUp size={18} className="text-primary" />
                  <span>{fileName || 'Pick a file…'}</span>
                  <input type="file" accept={current.accept} className="sr-only" aria-label="File to import" onChange={e => onFile(e.target.files?.[0])} />
                </label>
                {tab === 'notion' && !table && (
                  <div className="space-y-2">
                    <label htmlFor="paste" className="block text-xs font-medium text-muted-foreground">…or paste a checklist (“- [ ] task” lines)</label>
                    <textarea id="paste" value={checklist} onChange={e => { setChecklist(e.target.value); setPreview(null) }} rows={5} className={`${field} w-full font-mono`} placeholder={'# Work\n- [ ] Draft the proposal\n- [x] Send invoice'} />
                  </div>
                )}
                {textMode || (tab === 'notion' && checklist && !table) ? (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={headingsAsThreads} onChange={e => setHeadingsAsThreads(e.target.checked)} /> Use headings as threads</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={bullets} onChange={e => setBullets(e.target.checked)} /> Count plain bullets too</label>
                  </div>
                ) : null}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>

            {table && mapping && (
              <Card>
                <CardHeader>
                  <CardTitle>2. Match the columns</CardTitle>
                  <CardDescription>{source === 'todoist' ? 'Todoist file recognised. Only tasks are imported (not sections or notes).' : source === 'notion' ? 'Notion file recognised.' : 'Tell me which column is which. I’ve guessed from the headings.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {COLUMNS.map(c => (
                      <label key={c.key} className="text-xs text-muted-foreground space-y-1">
                        <span className="block">{c.label}{c.help ? <span className="font-normal"> · {c.help}</span> : null}</span>
                        <select aria-label={c.label} className={`${field} w-full`} value={mapping[c.key]} onChange={e => { setMapping({ ...mapping, [c.key]: Number(e.target.value) }); setPreview(null) }}>
                          <option value={NO_COLUMN}>(none)</option>
                          {table[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">Dates like 03/04/2026 are
                      <select aria-label="Date order" className={field} value={dateOrder} onChange={e => { setDateOrder(e.target.value as DateOrder); setPreview(null) }}>
                        <option value="mdy">month/day</option>
                        <option value="dmy">day/month</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">Thread for rows without one
                      <input aria-label="Default thread" className={`${field} w-44`} value={defaultThread} maxLength={100} onChange={e => { setDefaultThread(e.target.value); setPreview(null) }} placeholder="(none)" />
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}

            {ready && (
              <Card>
                <CardHeader><CardTitle>{table ? '3' : '2'}. Check and import</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {tab === 'winterarc' && waCounts ? (
                    <p>This file has <b>{waCounts.threads}</b> threads, <b>{waCounts.tasks}</b> tasks, <b>{waCounts.goals}</b> goals and <b>{waCounts.wishlist}</b> wishlist items.</p>
                  ) : (
                    <>
                      <p><b>{rows.length}</b> task{rows.length === 1 ? '' : 's'} found{built && built.skipped ? ` (${built.skipped} other row${built.skipped === 1 ? '' : 's'} left out)` : ''}.</p>
                      {built && built.unreadableDates > 0 && <p className="text-muted-foreground">{built.unreadableDates} date{built.unreadableDates === 1 ? '' : 's'} couldn’t be read (repeating or free text), so those tasks go in without a date.</p>}
                      <ul className="space-y-1 border border-border rounded-lg p-3 bg-card">
                        {rows.slice(0, 8).map((r, i) => (
                          <li key={i} className="flex flex-wrap gap-x-2 text-xs"><span className="font-medium">{r.title}</span><span className="text-muted-foreground">{[r.thread && `in ${r.thread}`, r.dueDate && `due ${r.dueDate}`, r.date && `on ${r.date}`, r.priority, r.status === 'done' && 'done'].filter(Boolean).join(' · ')}</span></li>
                        ))}
                        {rows.length > 8 && <li className="text-xs text-muted-foreground">…and {rows.length - 8} more</li>}
                      </ul>
                      <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={createThreads} onChange={e => { setCreateThreads(e.target.checked); setPreview(null) }} /> Create a thread for each new thread name</label>
                    </>
                  )}
                  {preview && (
                    <p className="p-3 rounded-lg bg-secondary">
                      Ready: <b>{preview.created}</b> to add{preview.duplicates ? `, ${preview.duplicates} already here (skipped)` : ''}{preview.invalid ? `, ${preview.invalid} unreadable (skipped)` : ''}{preview.newThreads.length ? `. New threads: ${preview.newThreads.slice(0, 6).join(', ')}${preview.newThreads.length > 6 ? '…' : ''}` : ''}{preview.goalsCreated ? `. ${preview.goalsCreated} goals` : ''}{preview.wishlistCreated ? `, ${preview.wishlistCreated} wishlist items` : ''}.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => run(true)}>{busy && !preview ? 'Checking…' : 'Check first'}</Button>
                    <Button disabled={busy || (!!preview && preview.created === 0 && !preview.goalsCreated && !preview.wishlistCreated)} onClick={() => run(false)}>{busy ? 'Importing…' : 'Import'}</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}
