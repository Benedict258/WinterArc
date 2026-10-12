import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Overview = {
  sharedWithMe: { _id: string; name: string; role: 'editor' | 'viewer'; ownerName: string }[]
  mine: { id: string; name: string; members: number }[]
  invites: { id: string; threadName: string; from: string; role: 'editor' | 'viewer' }[]
}

/** Invitations to shared threads, and the threads other people have shared with you. Renders nothing when there are none. */
export default function SharedThreadsSection() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['teams-overview'],
    queryFn: async (): Promise<Overview | null> => {
      const res = await fetch('/api/teams/overview', { credentials: 'include' })
      return res.ok ? res.json() : null
    },
  })
  const respond = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' }) => {
      const res = await fetch(`/api/teams/invitations/${id}/respond`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!res.ok) throw new Error('Could not respond')
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teams-overview'] }); queryClient.invalidateQueries({ queryKey: ['threads'] }) },
  })
  if (!data || (!data.invites.length && !data.sharedWithMe.length)) return null

  return (
    <section className="space-y-3" aria-label="Shared threads">
      {data.invites.map(i => (
        <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-primary/50 bg-card text-sm">
          <p><b className="break-all">{i.from}</b> invited you to {i.role === 'editor' ? 'work on' : 'follow'} <b className="break-all">“{i.threadName}”</b>.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: i.id, action: 'accept' })}>Accept</Button>
            <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ id: i.id, action: 'decline' })}>Decline</Button>
          </div>
        </div>
      ))}
      {data.sharedWithMe.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Users size={15} /> Shared with you</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {data.sharedWithMe.map(t => (
              <button key={t._id} onClick={() => navigate(`/teams/${t._id}`)} className="text-left p-3 rounded-lg border border-border bg-card hover:border-primary transition-colors">
                <div className="flex items-center justify-between gap-2"><span className="font-medium break-all">{t.name}</span><Badge variant="outline" className="text-[10px]">{t.role}</Badge></div>
                <p className="text-xs text-muted-foreground mt-0.5">from {t.ownerName}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
