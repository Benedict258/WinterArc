import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

const field = 'w-full px-3 py-2 border rounded-md text-sm bg-background border-border focus:outline-none focus:ring-2 focus:ring-primary'

/** Terms, privacy policy and deleting your account. (Downloading your data is in Data Management above.) */
export default function PrivacyCard() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'admin'
  const ready = email.trim().toLowerCase() === user?.email.toLowerCase()

  const remove = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: email, ...(password ? { password } : {}) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Deleting failed')
      await logout() // clears this device's copy too
    } catch (err) {
      setError(err instanceof TypeError ? 'Can’t reach the server. Check your connection and try again.' : (err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy &amp; account</CardTitle>
        <CardDescription>
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> · <Link to="/terms" className="text-primary hover:underline">Terms of Use</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!open ? (
          <Button variant="outline" className="gap-2 text-destructive" disabled={isAdmin} onClick={() => setOpen(true)}>
            <Trash2 size={16} /> Delete my account
          </Button>
        ) : (
          <form onSubmit={remove} className="space-y-3 p-4 rounded-lg border border-destructive/50">
            <p className="text-sm">This permanently erases your account, threads, tasks, goals, wishlist, Drop files and reminders. It can’t be undone. Download your data first if you want a copy.</p>
            <div className="space-y-1.5">
              <label htmlFor="del-email" className="block text-xs font-medium text-muted-foreground">Type your email ({user?.email}) to confirm</label>
              <input id="del-email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" className={field} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="del-pass" className="block text-xs font-medium text-muted-foreground">Your password (leave empty if you only use Google)</label>
              <input id="del-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className={field} />
            </div>
            {error && <p role="alert" className="text-xs text-destructive font-medium">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); setError('') }} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={!ready || busy}>{busy ? 'Deleting…' : 'Delete everything'}</Button>
            </div>
          </form>
        )}
        {isAdmin && <p className="text-xs text-muted-foreground">Admin accounts can’t be deleted from here.</p>}
      </CardContent>
    </Card>
  )
}
