import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Send, Sparkles, X } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

type Card = { id: string; kind: string; summary: string; details: string[]; destructive: boolean }
type Outcome = { ok: boolean; message: string }
type Msg = { role: 'user' | 'assistant'; content: string; cards?: Card[]; outcomes?: Record<string, Outcome>; dismissed?: string[] }
type Usage = { used: number; allowance: number; remaining: number; today: number; dailyCap: number; moreRequested: boolean; resetsOn: string }

export const AI_STORAGE_PREFIX = 'winterarc.ai.'

const QUICK = [
  { label: 'Break a goal into steps', prompt: 'Break this goal into concrete steps and tasks: ', focus: true },
  { label: 'Plan my week', prompt: 'Look at my threads, tasks and backlog and suggest a plan for this week.' },
  { label: 'Weekly review', prompt: 'Review my past week honestly: what got done, what slipped, and what should change.' },
  { label: 'Tidy my backlog', prompt: 'Go through my backlog and suggest what to schedule, what to merge, and what to drop.' },
]

async function api<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
}

function UsageBar({ usage, onMore }: { usage: Usage; onMore: () => void }) {
  const pct = Math.min(100, Math.round((usage.used / usage.allowance) * 100))
  return (
    <div className="space-y-1" aria-label="AI allowance">
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className={`h-full ${pct >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>
      <p className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 items-center">
        <span>{pct}% of this month’s allowance used · resets {usage.resetsOn}</span>
        {pct >= 70 && !usage.moreRequested && <button className="text-primary hover:underline" onClick={onMore}>Ask for more</button>}
        {usage.moreRequested && <span>Request sent</span>}
      </p>
    </div>
  )
}

function Proposals({ msg, onApply, onDismiss, busy }: { msg: Msg; onApply: (ids: string[]) => void; onDismiss: (ids: string[]) => void; busy: boolean }) {
  const open = (msg.cards ?? []).filter(c => !msg.outcomes?.[c.id] && !msg.dismissed?.includes(c.id))
  // destructive suggestions are never ticked for you
  const [picked, setPicked] = useState<Set<string>>(() => new Set(open.filter(c => !c.destructive).map(c => c.id)))
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const chosen = open.filter(c => picked.has(c.id)).map(c => c.id)

  return (
    <div className="mt-3 space-y-2">
      {(msg.cards ?? []).map(c => {
        const outcome = msg.outcomes?.[c.id]
        const dismissed = msg.dismissed?.includes(c.id)
        return (
          <div key={c.id} className={`p-3 rounded-lg border text-sm ${c.destructive ? 'border-destructive/60' : 'border-border'} ${dismissed ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-2">
              {!outcome && !dismissed && <input type="checkbox" aria-label={`Include: ${c.summary}`} className="mt-1 accent-primary" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />}
              {outcome?.ok && <Check size={16} className="mt-0.5 text-emerald-500 shrink-0" />}
              {outcome && !outcome.ok && <AlertTriangle size={16} className="mt-0.5 text-destructive shrink-0" />}
              {dismissed && <X size={16} className="mt-0.5 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <p className={`font-medium ${c.destructive ? 'text-destructive' : ''}`}>{c.summary}</p>
                {c.details.length > 0 && <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc pl-4">{c.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
                {outcome && <p className={`text-xs mt-1 ${outcome.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{outcome.message}</p>}
                {dismissed && <p className="text-xs mt-1 text-muted-foreground">Dismissed</p>}
              </div>
            </div>
          </div>
        )
      })}
      {open.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(open.map(c => c.id))}>Dismiss all</Button>
          <Button size="sm" disabled={busy || !chosen.length} onClick={() => onApply(chosen)}>{busy ? 'Applying…' : `Apply ${chosen.length} change${chosen.length === 1 ? '' : 's'}`}</Button>
        </div>
      )}
    </div>
  )
}

export default function AssistantPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const storageKey = `${AI_STORAGE_PREFIX}${user?.id}`
  const [messages, setMessages] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<{ text: string; quota?: boolean } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: status, refetch } = useQuery({ queryKey: ['ai-status'], queryFn: async () => (await api<{ enabled: boolean; usage: Usage }>('/api/ai/status')).data })
  const [usage, setUsage] = useState<Usage | null>(null)
  const shownUsage = usage ?? status?.usage ?? null

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))) } catch { /* storage unavailable */ }
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, storageKey])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return
    setError(null)
    setInput('')
    const history = [...messages, { role: 'user' as const, content }]
    setMessages(history)
    setSending(true)
    try {
      // the model gets plain text only; cards and results stay on this device
      const payload = history.slice(-20).map(m => ({ role: m.role, content: m.content }))
      while (payload.length && payload[0].role !== 'user') payload.shift()
      const res = await api<{ reply: string; proposals: Card[]; usage: Usage }>('/api/ai/chat', { messages: payload })
      if (!res.ok) {
        setError({ text: res.data.error || 'Something went wrong.', quota: res.data.code === 'ai_quota' })
        setMessages(history.slice(0, -1))
        setInput(content)
        return
      }
      setUsage(res.data.usage)
      setMessages([...history, { role: 'assistant', content: res.data.reply, cards: res.data.proposals }])
    } catch {
      setError({ text: 'Can’t reach the server. Check your connection and try again.' })
      setMessages(history.slice(0, -1))
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const patch = (cardIds: string[], change: (m: Msg) => Msg) =>
    setMessages(ms => ms.map(m => (m.cards?.some(c => cardIds.includes(c.id)) ? change(m) : m)))

  const apply = async (ids: string[]) => {
    setApplying(true)
    try {
      const res = await api<{ results: { id: string; ok: boolean; message: string }[] }>('/api/ai/proposals/apply', { ids })
      if (!res.ok) { setError({ text: res.data.error || 'Couldn’t apply.' }); return }
      patch(ids, m => ({ ...m, outcomes: { ...m.outcomes, ...Object.fromEntries(res.data.results.map(r => [r.id, { ok: r.ok, message: r.message }])) } }))
      await queryClient.invalidateQueries() // threads, tasks and settings may all have changed
      window.dispatchEvent(new Event('winterarc-data-changed'))
    } finally {
      setApplying(false)
    }
  }

  const dismiss = async (ids: string[]) => {
    await api('/api/ai/proposals/dismiss', { ids })
    patch(ids, m => ({ ...m, dismissed: [...(m.dismissed ?? []), ...ids] }))
  }

  const askMore = async () => { await api('/api/ai/request-more', {}); refetch(); setUsage(u => (u ? { ...u, moreRequested: true } : u)) }

  const pickQuick = (q: (typeof QUICK)[number]) => {
    if (q.focus) { setInput(q.prompt); inputRef.current?.focus() } else send(q.prompt)
  }

  const clear = () => { setMessages([]); setError(null) }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4 min-h-[calc(100vh-8rem)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><Sparkles className="text-primary" size={28} /> Assistant</h1>
            <p className="text-muted-foreground mt-1">Ask about your plan. It suggests changes; nothing happens until you approve.</p>
          </div>
          {messages.length > 0 && <Button variant="ghost" size="sm" onClick={clear}>New chat</Button>}
        </div>

        {status && !status.enabled && (
          <div className="p-4 rounded-lg border border-border bg-card text-sm">The assistant isn’t switched on for this server yet. The person running it needs to add an AI provider key (Groq or NVIDIA).</div>
        )}

        {shownUsage && status?.enabled && <UsageBar usage={shownUsage} onMore={askMore} />}

        <div className="flex-1 space-y-4" aria-live="polite">
          {messages.length === 0 && status?.enabled && (
            <div className="grid sm:grid-cols-2 gap-2">
              {QUICK.map(q => (
                <button key={q.label} onClick={() => pickQuick(q)} className="text-left p-3 rounded-lg border border-border bg-card hover:border-primary transition-colors text-sm font-medium">{q.label}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                {m.content}
                {m.cards && m.cards.length > 0 && <div className="whitespace-normal"><Proposals msg={m} busy={applying} onApply={apply} onDismiss={dismiss} /></div>}
              </div>
            </div>
          ))}
          {sending && <p className="text-sm text-muted-foreground animate-pulse">Thinking…</p>}
          <div ref={endRef} />
        </div>

        {error && (
          <div role="alert" className="text-sm text-destructive flex flex-wrap items-center gap-2">
            <span>{error.text}</span>
            {error.quota && shownUsage && !shownUsage.moreRequested && <Button size="sm" variant="outline" onClick={askMore}>Ask for more</Button>}
          </div>
        )}

        <form className="sticky bottom-2 flex gap-2 items-end" onSubmit={e => { e.preventDefault(); send(input) }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            rows={2}
            maxLength={4000}
            placeholder={status?.enabled === false ? 'Not available yet' : 'Ask about your plan, or describe what you want to change…'}
            disabled={!status?.enabled || sending}
            aria-label="Message"
            className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!status?.enabled || sending || !input.trim()}><Send size={16} /></Button>
        </form>
      </div>
    </MainLayout>
  )
}
