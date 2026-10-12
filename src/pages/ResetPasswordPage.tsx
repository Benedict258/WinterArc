import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { AuthShell, PasswordField } from '@/components/AuthGate'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
      if (res.ok) setDone(true)
      else setError((await res.json().catch(() => ({}))).error || 'Something went wrong.')
    } catch {
      setError('Can’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <p className="text-sm text-center text-muted-foreground">You’ve been signed out everywhere. Sign in with your new password.</p>
        <Link to="/" className={buttonVariants({ className: 'w-full' })}>Go to sign in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <PasswordField value={password} onChange={setPassword} label="New password" autoComplete="new-password" placeholder="At least 10 characters" />
        {error && <p role="alert" className="text-xs text-destructive font-medium">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !password || !token}>Update password</Button>
      </form>
    </AuthShell>
  )
}
