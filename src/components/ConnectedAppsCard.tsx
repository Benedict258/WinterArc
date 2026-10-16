import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Plug, Unplug } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { confirmDialog } from '@/components/DialogHost'

type Grant = { id: string; client: string; scopes: string[]; connectedAt: string; lastUsedAt: string | null; calls: number }
type Data = { mcpUrl: string; enabled: boolean; grants: Grant[] }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never')

/** Connect Claude, ChatGPT or another AI app to your account, and see or remove the apps that are connected. */
export default function ConnectedAppsCard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const { data } = useQuery({
    queryKey: ['oauth-grants'],
    queryFn: async () => { const r = await fetch('/api/oauth/grants', { credentials: 'include' }); if (!r.ok) throw new Error('grants'); return (await r.json()) as Data },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`/api/oauth/grants/${id}`, { method: 'DELETE', credentials: 'include' }); if (!r.ok) throw new Error('revoke') },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-grants'] }),
    onError: () => toast({ title: 'Couldn’t disconnect it', variant: 'destructive' }),
  })
  if (!data) return null

  const copy = async () => {
    try { await navigator.clipboard.writeText(data.mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { toast({ title: 'Copy it by hand', description: data.mcpUrl }) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plug size={20} /> Connected apps</CardTitle>
        <CardDescription>Let Claude, ChatGPT or another AI app read your plan and log things for you, the way Notion’s connectors work. You approve each app, choose whether it can make changes, and can disconnect it here at any time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.enabled ? <p className="text-sm text-muted-foreground">Connections to other apps are switched off on this server.</p> : (
          <>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Your connector address</p>
              <div className="flex gap-2">
                <input readOnly aria-label="Connector address" value={data.mcpUrl} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 px-2.5 py-2 border rounded-md text-sm font-mono bg-background border-border" />
                <Button variant="outline" className="gap-1.5 shrink-0" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">How to connect</summary>
              <div className="mt-2 space-y-3 text-muted-foreground">
                <div><p className="text-foreground font-medium">Claude</p><p>Settings → Connectors → Add custom connector. Paste the address above and continue. Claude opens a WinterArc page where you choose what to allow. (Needs a Claude plan that supports custom connectors.)</p></div>
                <div><p className="text-foreground font-medium">ChatGPT</p><p>Settings → Apps &amp; Connectors → turn on developer mode, then create a connector with the address above and sign in with WinterArc. (Needs a ChatGPT plan that supports developer mode.)</p></div>
                <div><p className="text-foreground font-medium">Others</p><p>Any app that supports remote MCP servers with sign-in can use the same address.</p></div>
                <p>Whatever an app reads goes to that app and its AI provider, under their privacy terms. Connect only apps you trust.</p>
              </div>
            </details>
          </>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">Connected now</p>
          {data.grants.length === 0 ? <p className="text-sm text-muted-foreground">No apps are connected.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.grants.map(g => (
                <li key={g.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{g.client}</p>
                    <p className="text-xs text-muted-foreground">{g.scopes.includes('mcp:write') ? 'Can read and make changes' : 'Read only'} · connected {when(g.connectedAt)} · last used {when(g.lastUsedAt)} · {g.calls} request{g.calls === 1 ? '' : 's'}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0 text-destructive" aria-label={`Disconnect ${g.client}`}
                    onClick={async () => { if (await confirmDialog({ title: `Disconnect ${g.client}?`, description: 'It will stop working straight away. You can connect it again later.', confirmLabel: 'Disconnect', destructive: true })) revoke.mutate(g.id) }}>
                    <Unplug size={14} /> Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
