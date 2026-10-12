import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, UserPlus } from 'lucide-react'
import MainLayout from '@/components/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'

type Member = { id: string; userId: string | null; name: string; role: 'owner' | 'editor' | 'viewer'; status: 'active' | 'pending'; you: boolean }
type Info = { thread: { id: string; name: string; status: string }; role: 'owner' | 'editor' | 'viewer'; members: Member[] }
type TeamTask = {
  id: string; title: string; status: 'pending' | 'done' | 'skipped'; priority: string; dueDate: string | null
  assignee: { id: string; name: string; you: boolean }; createdBy: string | null; canEdit: boolean; updatedAt: string
}

const field = 'px-2.5 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'

class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
async function call<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status)
  return data as T
}

export default function TeamThreadPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')

  // Teammates change things too, so look again every 15 seconds
  const info = useQuery({ queryKey: ['team', id], queryFn: () => call<Info>(`/api/teams/${id}`), refetchInterval: 15_000, retry: false })
  const tasks = useQuery({ queryKey: ['team-tasks', id], queryFn: () => call<{ tasks: TeamTask[] }>(`/api/teams/${id}/tasks`), refetchInterval: 15_000, retry: false })
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['team', id] }); queryClient.invalidateQueries({ queryKey: ['team-tasks', id] }); queryClient.invalidateQueries({ queryKey: ['tasks'] }); queryClient.invalidateQueries({ queryKey: ['threads'] }) }
  const failed = (title: string) => (e: Error) => {
    toast({ title, description: e.message, variant: 'destructive' })
    if (e instanceof ApiError && e.status === 409) refresh() // someone got there first: show their version
  }

  const role = info.data?.role
  const canEdit = role === 'owner' || role === 'editor'
  const active = (info.data?.members ?? []).filter(m => m.status === 'active' && m.userId)
  const me = active.find(m => m.you)

  const add = useMutation({
    mutationFn: () => call(`/api/teams/${id}/tasks`, 'POST', { title, ...(assignee ? { assigneeId: assignee } : {}), ...(due ? { dueDate: due } : {}) }),
    onSuccess: () => { setTitle(''); setDue(''); refresh() },
    onError: failed('Couldn’t add the task'),
  })
  const change = useMutation({
    mutationFn: ({ task, body }: { task: TeamTask; body: object }) => call(`/api/teams/${id}/tasks/${task.id}`, 'PUT', { ...body, expectedUpdatedAt: task.updatedAt }),
    // ticking a box shows at once; the server's answer (or a teammate's newer version) replaces it
    onMutate: async ({ task, body }) => {
      await queryClient.cancelQueries({ queryKey: ['team-tasks', id] })
      const previous = queryClient.getQueryData<{ tasks: TeamTask[] }>(['team-tasks', id])
      const status = (body as { status?: TeamTask['status'] }).status
      if (previous && status) queryClient.setQueryData(['team-tasks', id], { ...previous, tasks: previous.tasks.map(t => (t.id === task.id ? { ...t, status } : t)) })
      return { previous }
    },
    onSuccess: refresh,
    onError: (e: Error, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(['team-tasks', id], ctx.previous); failed('Couldn’t change the task')(e) },
  })
  const remove = useMutation({ mutationFn: (taskId: string) => call(`/api/teams/${id}/tasks/${taskId}`, 'DELETE'), onSuccess: refresh, onError: failed('Couldn’t delete') })
  const invite = useMutation({
    mutationFn: () => call(`/api/teams/${id}/members`, 'POST', { email: inviteEmail, role: inviteRole }),
    onSuccess: () => { toast({ title: 'Invitation sent', description: 'If they’re not on WinterArc yet, they’ll need an invite code from you.' }); setInviteEmail(''); refresh() },
    onError: failed('Couldn’t invite'),
  })
  const setRole = useMutation({ mutationFn: ({ memberId, r }: { memberId: string; r: string }) => call(`/api/teams/${id}/members/${memberId}`, 'PUT', { role: r }), onSuccess: refresh, onError: failed('Couldn’t change the role') })
  const removeMember = async (m: Member) => {
    const self = m.you
    if (!(await confirmDialog({ title: self ? 'Leave this thread?' : `Remove ${m.name}?`, description: self ? 'Your tasks stay with you, but are no longer part of the thread.' : 'Their tasks stay with them, but are no longer part of the thread.', confirmLabel: self ? 'Leave' : 'Remove', destructive: true }))) return
    try { await call(`/api/teams/${id}/members/${m.id}`, 'DELETE'); if (self) navigate('/threads'); else refresh() } catch (e) { failed('Couldn’t do that')(e as Error) }
  }

  if (info.error) {
    return <MainLayout><div className="max-w-2xl mx-auto space-y-3"><Link to="/threads" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft size={14} /> Threads</Link><p className="text-sm">This thread isn’t shared with you (or it no longer exists).</p></div></MainLayout>
  }

  const list = tasks.data?.tasks ?? []
  const open = list.filter(t => t.status !== 'done')
  const done = list.filter(t => t.status === 'done')

  const row = (t: TeamTask) => (
    <div key={t.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-border text-sm">
      <input type="checkbox" aria-label={`Done: ${t.title}`} className="mt-1 accent-primary" checked={t.status === 'done'} disabled={!t.canEdit || change.isPending} onChange={e => change.mutate({ task: t, body: { status: e.target.checked ? 'done' : 'pending' } })} />
      <div className="min-w-0 flex-1">
        <p className={`break-words ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</p>
        <p className="text-xs text-muted-foreground">
          {t.assignee.you ? 'You' : t.assignee.name}{t.dueDate ? ` · due ${t.dueDate}` : ''}{t.priority === 'high' ? ' · high priority' : ''}{t.createdBy && !t.assignee.you ? ` · added by ${t.createdBy}` : ''}
        </p>
      </div>
      {(role === 'owner' || t.createdBy) && t.canEdit && active.length > 1 && (
        <select aria-label={`Assign ${t.title}`} className={`${field} max-w-[9rem]`} value={t.assignee.id} disabled={change.isPending} onChange={e => change.mutate({ task: t, body: { assigneeId: e.target.value } })}>
          {active.map(m => <option key={m.userId!} value={m.userId!}>{m.you ? 'Me' : m.name}</option>)}
        </select>
      )}
      {t.canEdit && <Button size="icon" variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => remove.mutate(t.id)}><Trash2 size={15} /></Button>}
    </div>
  )

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link to="/threads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Threads</Link>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h1 className="text-3xl sm:text-4xl font-bold break-all">{info.data?.thread.name ?? '…'}</h1>
            {role && <Badge variant="outline">{role}</Badge>}
          </div>
          {role === 'owner' && <p className="text-sm text-muted-foreground mt-1">You own this thread. <Link className="text-primary hover:underline" to={`/threads/${id}`}>Open it in your Threads</Link> for notes, resources and its schedule.</p>}
          {role === 'viewer' && <p className="text-sm text-muted-foreground mt-1">You can follow this thread but not change it.</p>}
        </div>

        <Card>
          <CardHeader><CardTitle>Team tasks</CardTitle><CardDescription>Everyone here sees these. When a task is given to you it appears in your own plan; your planned day stays private.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {canEdit && info.data?.thread.status !== 'archived' && (
              <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (title.trim()) add.mutate() }}>
                <input aria-label="New team task" className={`${field} flex-1 min-w-[10rem]`} placeholder="Add a task…" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
                <select aria-label="Assign to" className={field} value={assignee} onChange={e => setAssignee(e.target.value)}>
                  <option value="">{me ? 'Me' : 'Assign to…'}</option>
                  {active.filter(m => !m.you).map(m => <option key={m.userId!} value={m.userId!}>{m.name}</option>)}
                </select>
                <input aria-label="Due date" type="date" className={field} value={due} onChange={e => setDue(e.target.value)} />
                <Button type="submit" size="icon" aria-label="Add task" disabled={add.isPending || !title.trim()}><Plus size={16} /></Button>
              </form>
            )}
            {tasks.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            <div className="space-y-1.5">{open.map(row)}</div>
            {!tasks.isLoading && !open.length && <p className="text-sm text-muted-foreground">Nothing open.</p>}
            {done.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{done.length} done</summary><div className="space-y-1.5 mt-2">{done.map(row)}</div></details>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>People</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1.5">
              {info.data?.members.map(m => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border">
                  <span className="break-all">{m.name}{m.you ? ' (you)' : ''}{m.status === 'pending' ? ' · invited' : ''}</span>
                  <span className="flex items-center gap-2">
                    {role === 'owner' && m.role !== 'owner' ? (
                      <select aria-label={`Role of ${m.name}`} className={field} value={m.role} onChange={e => setRole.mutate({ memberId: m.id, r: e.target.value })}>
                        <option value="editor">Editor</option><option value="viewer">Viewer</option>
                      </select>
                    ) : <Badge variant="outline" className="text-[10px]">{m.role}</Badge>}
                    {m.role !== 'owner' && (role === 'owner' || m.you) && <Button size="sm" variant="ghost" onClick={() => removeMember(m)}>{m.you ? 'Leave' : m.status === 'pending' ? 'Withdraw' : 'Remove'}</Button>}
                  </span>
                </div>
              ))}
            </div>
            {role === 'owner' && (
              <form className="flex flex-wrap gap-2 pt-2 border-t border-border" onSubmit={e => { e.preventDefault(); if (inviteEmail.trim()) invite.mutate() }}>
                <input type="email" aria-label="Email to invite" required className={`${field} flex-1 min-w-[12rem]`} placeholder="teammate@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                <select aria-label="Role for the invitation" className={field} value={inviteRole} onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}>
                  <option value="editor">Can add and edit</option><option value="viewer">Can only view</option>
                </select>
                <Button type="submit" disabled={invite.isPending || !inviteEmail.trim()} className="gap-1.5"><UserPlus size={15} /> Invite</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
