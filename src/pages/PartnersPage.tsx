import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, UserPlus, Flame } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'

type Shares = { streak: boolean; weekProgress: boolean; threads: boolean; taskTitles: boolean }
type Partner = { id: string; name: string; youShare: Shares; theyShare: Shares }
type Overview = { partners: Partner[]; incoming: { id: string; from: string; fromEmail?: string }[]; outgoing: { id: string; email: string }[] }
type Progress = {
  name: string; streak?: number
  week?: { completed: number; total: number; perDay: { day: string; done: number; total: number }[] }
  threads?: { name: string; done: number; total: number }[]
  today?: { title: string; done: boolean }[]
}

const SHARE_LABELS: [keyof Shares, string][] = [
  ['streak', 'My streak'],
  ['weekProgress', 'How my week is going (counts only)'],
  ['threads', 'My thread names and progress'],
  ['taskTitles', 'Titles of today’s tasks'],
]
const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'

async function call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data as T
}

function PartnerCard({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  // tick boxes respond instantly; the saved value takes over once it comes back
  const [pending, setPending] = useState<Partial<Shares>>({})
  const savedShares = JSON.stringify(partner.youShare)
  useEffect(() => { setPending({}) }, [savedShares])
  const { data: progress } = useQuery({ queryKey: ['partner-progress', partner.id], queryFn: () => call<Progress>(`/api/partners/${partner.id}/progress`), refetchInterval: 60_000 })
  const share = useMutation({
    mutationFn: (change: Partial<Shares>) => call(`/api/partners/${partner.id}/sharing`, 'PUT', change),
    onSuccess: onChanged,
    onError: (e: Error) => { setPending({}); toast({ title: 'Couldn’t save', description: e.message, variant: 'destructive' }) },
  })
  const cheer = useMutation({
    mutationFn: () => call(`/api/partners/${partner.id}/cheer`, 'POST', {}),
    onSuccess: () => toast({ title: 'Cheer sent' }),
    onError: (e: Error) => toast({ title: 'Couldn’t cheer', description: e.message, variant: 'destructive' }),
  })
  const end = async () => {
    if (await confirmDialog({ title: `Stop partnering with ${partner.name}?`, description: 'You’ll stop seeing each other’s progress. Either of you can invite again later.', confirmLabel: 'Remove', destructive: true })) {
      await call(`/api/partners/${partner.id}`, 'DELETE').catch(() => {})
      onChanged()
    }
  }
  const nothing = progress && !progress.week && progress.streak === undefined && !progress.threads && !progress.today

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg break-all">{partner.name}</CardTitle>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={cheer.isPending} onClick={() => cheer.mutate()}><Heart size={14} /> Cheer</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Done' : 'What I share'}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {nothing && <p className="text-muted-foreground">{partner.name} isn’t sharing anything with you yet.</p>}
        {progress?.streak !== undefined && <p className="flex items-center gap-1.5"><Flame size={16} className="text-primary" /> <b>{progress.streak}</b> day streak</p>}
        {progress?.week && (
          <div className="space-y-1.5">
            <p>This week: <b>{progress.week.completed}</b> of <b>{progress.week.total}</b> tasks done</p>
            <div className="flex gap-1" aria-label="Tasks done each day this week">
              {progress.week.perDay.map(d => (
                <div key={d.day} title={`${d.day}: ${d.done}/${d.total}`} className="flex-1 h-2 rounded bg-secondary overflow-hidden"><div className="h-full bg-primary" style={{ width: d.total ? `${Math.round((d.done / d.total) * 100)}%` : '0%' }} /></div>
              ))}
            </div>
          </div>
        )}
        {progress?.threads && progress.threads.length > 0 && (
          <ul className="space-y-1">{progress.threads.map(t => <li key={t.name} className="flex justify-between gap-2"><span className="break-all">{t.name}</span><span className="text-muted-foreground shrink-0">{t.done}/{t.total}</span></li>)}</ul>
        )}
        {progress?.today && progress.today.length > 0 && (
          <ul className="space-y-0.5 text-muted-foreground">{progress.today.map((t, i) => <li key={i} className={t.done ? 'line-through' : ''}>{t.title}</li>)}</ul>
        )}

        {open && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">{partner.name} can see exactly what’s ticked here, and nothing else. Change it whenever you like.</p>
            {SHARE_LABELS.map(([key, text]) => (
              <label key={key} className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={pending[key] ?? partner.youShare[key]} onChange={e => { setPending(p => ({ ...p, [key]: e.target.checked })); share.mutate({ [key]: e.target.checked }) }} /> {text}</label>
            ))}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={end}>Remove partner</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function PartnersPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['partners'], queryFn: () => call<Overview>('/api/partners') })
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['partners'] }); queryClient.invalidateQueries({ queryKey: ['partner-progress'] }) }

  const send = useMutation({
    mutationFn: () => call('/api/partners/invite', 'POST', { email }),
    onSuccess: () => { toast({ title: 'Invitation sent', description: 'If they’re not on WinterArc yet, they’ll need an invite code from you.' }); setEmail(''); refresh() },
    onError: (e: Error) => toast({ title: 'Couldn’t invite', description: e.message, variant: 'destructive' }),
  })
  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' | 'block' }) => call(`/api/partners/${id}/respond`, 'POST', { action }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: 'Couldn’t do that', description: e.message, variant: 'destructive' }),
  })
  const withdraw = useMutation({ mutationFn: (id: string) => call(`/api/partners/${id}`, 'DELETE'), onSuccess: refresh })

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold">Partners</h1>
          <p className="text-muted-foreground mt-1">Keep each other going. You choose what each partner can see, and you can change it any time.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus size={18} /> Invite a partner</CardTitle>
            <CardDescription>They get an email. Nothing is shared until they accept.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (email.trim()) send.mutate() }}>
              <input type="email" aria-label="Partner's email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="friend@example.com" className={`${field} flex-1 min-w-[12rem]`} />
              <Button type="submit" disabled={send.isPending || !email.trim()}>{send.isPending ? 'Sending…' : 'Send invitation'}</Button>
            </form>
          </CardContent>
        </Card>

        {data?.incoming.map(r => (
          <Card key={r.id}>
            <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm"><b className="break-all">{r.from}</b>{r.fromEmail && r.fromEmail !== r.from ? ` (${r.fromEmail})` : ''} wants to be your accountability partner.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, action: 'accept' })}>Accept</Button>
                <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, action: 'decline' })}>Decline</Button>
                <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, action: 'block' })}>Block</Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data?.partners.map(p => <PartnerCard key={p.id} partner={p} onChanged={refresh} />)}
        {data && !data.partners.length && !data.incoming.length && <p className="text-sm text-muted-foreground">No partners yet. Invite someone above.</p>}

        {data && data.outgoing.length > 0 && (
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Waiting for a reply</h2>
            {data.outgoing.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-2 text-sm p-2.5 rounded-lg border border-border">
                <span className="break-all">{o.email}</span>
                <Button size="sm" variant="ghost" onClick={() => withdraw.mutate(o.id)}>Withdraw</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
