import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { AuthShell } from '@/components/AuthGate'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

type Preview = { client: { name: string; redirectHost: string; loopback: boolean }; scopes: { id: string; label: string }[]; email: string }

const PARAMS = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const

/** Where another app (Claude, ChatGPT, …) sends you to ask for access. Shows who is asking and what for; nothing is shared until Allow. */
export default function OAuthAuthorizePage() {
  const [search] = useSearchParams()
  const { user } = useAuth()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [write, setWrite] = useState(true)

  const params = Object.fromEntries(PARAMS.filter(k => search.has(k)).map(k => [k, search.get(k)!]))
  const key = JSON.stringify(params)

  useEffect(() => {
    let cancelled = false
    setPreview(null); setError('')
    fetch(`/api/oauth/authorize/preview?${new URLSearchParams(params)}`, { credentials: 'include' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (cancelled) return
        if (r.ok) setPreview(body)
        else setError(r.status === 403 ? 'Confirm your email address first (see the banner at the top of the app), then connect again.' : body.error || 'This connection request isn’t valid.')
      })
      .catch(() => !cancelled && setError('Can’t reach the server. Check your connection and try again.'))
    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (decision: 'allow' | 'deny') => {
    if (!preview) return
    setBusy(true); setError('')
    try {
      const scopes = preview.scopes.map(s => s.id).filter(id => id === 'mcp:read' || write)
      const res = await fetch('/api/oauth/authorize/decision', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...params, decision, scopes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.redirectTo) throw new Error(body.error || 'Something went wrong. Please try again.')
      window.location.href = body.redirectTo // back to the app that asked
    } catch (e) {
      setError(e instanceof TypeError ? 'Can’t reach the server. Check your connection and try again.' : (e as Error).message)
      setBusy(false)
    }
  }

  const asksWrite = !!preview?.scopes.some(s => s.id === 'mcp:write')

  return (
    <AuthShell title={preview ? `Connect ${preview.client.name}?` : 'Connect an app'}>
      {error && (
        <div role="alert" className="text-sm text-destructive flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{error}</span></div>
      )}
      {!preview && !error && <p className="text-sm text-center text-muted-foreground">One moment…</p>}
      {preview && (
        <div className="space-y-4">
          <p className="text-sm">
            <b className="break-words">{preview.client.name}</b> wants to use your WinterArc account{user?.email ? <> (<span className="break-all">{user.email}</span>)</> : null}.
          </p>
          <p className="text-xs text-muted-foreground">
            It will send you back to <b className="break-all">{preview.client.redirectHost}</b>.
            {preview.client.loopback && ' That address is on your own computer, so only continue if you started this from an app you installed.'}
          </p>
          <div className="rounded-lg border border-border p-3 space-y-2.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">It will be able to</p>
            {preview.scopes.map(s => (
              <label key={s.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-primary" checked={s.id === 'mcp:read' ? true : write} disabled={s.id === 'mcp:read'} onChange={e => s.id === 'mcp:write' && setWrite(e.target.checked)} aria-label={s.label} />
                <span>{s.label}{s.id === 'mcp:read' && <span className="text-muted-foreground"> (always, or there’s nothing to connect)</span>}</span>
              </label>
            ))}
            {asksWrite && !write && <p className="text-xs text-muted-foreground">Read-only: it can look but not change anything.</p>}
          </div>
          <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} className="shrink-0 mt-0.5" /><span>It can’t change your password, delete your account, see billing or reach other people’s data. Anything it reads goes to that app and its AI provider. You can disconnect it any time in Settings → Connected apps.</span></p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide('deny')}>Cancel</Button>
            <Button className="flex-1" disabled={busy} onClick={() => decide('allow')}>{busy ? 'Connecting…' : 'Allow'}</Button>
          </div>
        </div>
      )}
      <Link to="/" className="block text-center text-xs text-muted-foreground hover:underline">Back to WinterArc</Link>
    </AuthShell>
  )
}
