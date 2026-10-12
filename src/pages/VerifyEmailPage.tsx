import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { AuthShell } from '@/components/AuthGate'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => { if (!cancelled) setState(r.ok ? 'done' : 'failed') })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [token])

  return (
    <AuthShell title={state === 'done' ? 'Email confirmed' : state === 'working' ? 'Confirming…' : 'Link not valid'}>
      <p className="text-sm text-center text-muted-foreground">
        {state === 'done' && 'Thanks — your email address is confirmed.'}
        {state === 'working' && 'One moment.'}
        {state === 'failed' && 'This confirmation link is invalid or has expired. Sign in and ask for a new one from the banner at the top.'}
      </p>
      <Link to="/" className={buttonVariants({ className: 'w-full' })}>Continue to WinterArc</Link>
    </AuthShell>
  )
}
