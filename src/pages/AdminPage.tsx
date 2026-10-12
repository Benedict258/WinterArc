import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Search, ShieldCheck, Trash2 } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'
import { useAuth } from '@/context/AuthContext'

type AdminUser = {
  id: string; email: string; name: string; role: string; status: 'active' | 'suspended'; emailVerified: boolean
  createdAt: string; lastSeenAt: string | null; tasks: number; threads: number; dropBytes: number
}
type Invite = { id: string; code: string; note: string; maxUses: number; remaining: number; expiresAt: string | null; revokedAt: string | null }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body as T
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'never')
const mb = (bytes: number) => (bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : '0')
const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'

function Stats() {
  const { data } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<any>('/api/admin/stats') })
  const items: [string, number][] | undefined = data && [
    ['Users', data.users.total], ['Active this week', data.users.active7d], ['New this week', data.users.signups7d],
    ['Email confirmed', data.users.verified], ['Suspended', data.users.suspended], ['Invite seats left', data.invites.seatsLeft],
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {(items ?? []).map(([label, value]) => (
        <div key={label} className="p-3 rounded-xl border border-border bg-card">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  )
}

function Users() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () => api<{ users: AdminUser[]; total: number; pages: number }>(`/api/admin/users?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ''}`),
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin'] }) }
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'suspend' | 'unsuspend' | 'delete' }) =>
      action === 'delete' ? api(`/api/admin/users/${id}`, { method: 'DELETE' }) : api(`/api/admin/users/${id}/${action}`, { method: 'POST', body: '{}' }),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: 'Action failed', description: e.message, variant: 'destructive' }),
  })

  const remove = async (u: AdminUser) => {
    if (await confirmDialog({ title: 'Delete this account?', description: `${u.email} and all of their data and files will be erased. This can’t be undone.`, confirmLabel: 'Delete account', destructive: true } as any)) {
      act.mutate({ id: u.id, action: 'delete' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>{data ? `${data.total} account${data.total === 1 ? '' : 's'}` : 'Loading…'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(q) }}>
          <input aria-label="Search by email" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email" className={`${field} flex-1`} />
          <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search size={16} /></Button>
        </form>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="space-y-2">
          {data?.users.map(u => (
            <div key={u.id} className="p-3 rounded-lg border border-border bg-card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-all">{u.email}{u.role === 'admin' && <span className="ml-2 text-[10px] uppercase text-primary">admin</span>}{u.status === 'suspended' && <span className="ml-2 text-[10px] uppercase text-destructive">suspended</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {when(u.createdAt)} · seen {when(u.lastSeenAt)} · {u.emailVerified ? 'email confirmed' : 'email unconfirmed'}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.threads} threads · {u.tasks} tasks · Drop {mb(u.dropBytes)}</p>
                </div>
                {u.role !== 'admin' && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: u.id, action: u.status === 'active' ? 'suspend' : 'unsuspend' })}>
                      {u.status === 'active' ? 'Suspend' : 'Restore'}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${u.email}`} disabled={act.isPending} onClick={() => remove(u)}><Trash2 size={16} /></Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {data && !data.users.length && <p className="text-sm text-muted-foreground">No one matches.</p>}
        </div>
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-muted-foreground">Page {page} of {data.pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Invites() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: invites = [] } = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => api<Invite[]>('/api/admin/invites') })
  const [form, setForm] = useState({ count: 1, uses: 1, days: 30, note: '' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const create = useMutation({
    mutationFn: () => api<{ code: string }[]>('/api/admin/invites', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: made => { refresh(); toast({ title: `${made.length} code${made.length === 1 ? '' : 's'} created`, description: made.map(c => c.code).join('  ') }) },
    onError: (e: Error) => toast({ title: 'Couldn’t create codes', description: e.message, variant: 'destructive' }),
  })
  const revoke = useMutation({ mutationFn: (id: string) => api(`/api/admin/invites/${id}/revoke`, { method: 'POST', body: '{}' }), onSuccess: refresh })
  const num = (key: 'count' | 'uses' | 'days', label: string, min: number, max: number) => (
    <label className="text-xs text-muted-foreground space-y-1">
      <span className="block">{label}</span>
      <input type="number" min={min} max={max} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Math.min(max, Math.max(min, Number(e.target.value) || min)) }))} className={`${field} w-24`} />
    </label>
  )
  const state = (c: Invite) => c.revokedAt ? 'revoked' : c.remaining <= 0 ? 'used up' : c.expiresAt && new Date(c.expiresAt) < new Date() ? 'expired' : `${c.remaining}/${c.maxUses} left`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite codes</CardTitle>
        <CardDescription>Sign-up needs a code during the beta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); create.mutate() }}>
          {num('count', 'How many codes', 1, 50)}
          {num('uses', 'Uses each', 1, 1000)}
          {num('days', 'Valid days (0 = no end)', 0, 365)}
          <label className="text-xs text-muted-foreground space-y-1 flex-1 min-w-[10rem]">
            <span className="block">Note</span>
            <input value={form.note} maxLength={120} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={`${field} w-full`} placeholder="e.g. first testers" />
          </label>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create codes'}</Button>
        </form>
        <div className="space-y-1.5">
          {invites.map(c => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border text-sm">
              <div className="min-w-0">
                <span className="font-mono tracking-wider">{c.code}</span>
                <span className="ml-2 text-xs text-muted-foreground">{state(c)}{c.note ? ` · ${c.note}` : ''}</span>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label={`Copy ${c.code}`} onClick={() => navigator.clipboard?.writeText(c.code).then(() => toast({ title: 'Copied' }))}><Copy size={15} /></Button>
                {!c.revokedAt && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(c.id)}>Revoke</Button>}
              </div>
            </div>
          ))}
          {!invites.length && <p className="text-sm text-muted-foreground">No codes yet.</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function Audit() {
  const { data = [] } = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api<{ id: string; action: string; targetUserId: string | null; detail: string; createdAt: string }[]>('/api/admin/audit') })
  return (
    <Card>
      <CardHeader><CardTitle>Recent admin actions</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-xs text-muted-foreground">
        {data.map(r => <p key={r.id}>{new Date(r.createdAt).toLocaleString()} · <b className="text-foreground">{r.action}</b>{r.detail ? ` · ${r.detail}` : ''}</p>)}
        {!data.length && <p>Nothing yet.</p>}
      </CardContent>
    </Card>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2"><ShieldCheck className="text-primary" /> Admin</h1>
          <p className="text-muted-foreground mt-1">People, invites and a record of what admins did.</p>
        </div>
        <Stats />
        <Users />
        <Invites />
        <Audit />
      </div>
    </MainLayout>
  )
}
