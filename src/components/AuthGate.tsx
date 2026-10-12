import React, { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, ArrowRight, Snowflake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { isNative } from '@/lib/native'
import OnboardingPage from '@/pages/OnboardingPage'

type Mode = 'signin' | 'signup' | 'forgot'

declare global {
  interface Window {
    google?: any
  }
}

/** Loads Google's sign-in script once and renders its button into `target`. */
function useGoogleButton(clientId: string | null, onCredential: (credential: string) => void, target: React.RefObject<HTMLDivElement>, active: boolean) {
  useEffect(() => {
    if (!clientId || !active || isNative() || !target.current) return
    const render = () => {
      if (!window.google?.accounts?.id || !target.current) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential) })
      target.current.innerHTML = ''
      window.google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' })
    }
    if (window.google?.accounts?.id) return render()
    const existing = document.querySelector<HTMLScriptElement>('script[data-gsi]')
    if (existing) { existing.addEventListener('load', render); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.dataset.gsi = '1'
    script.onload = render
    document.head.appendChild(script)
  }, [clientId, active, onCredential, target])
}

const inputClass = 'w-full px-3 py-2.5 border rounded-lg text-sm bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary border-border'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-1">
              <Snowflake size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function PasswordField({ value, onChange, label = 'Password', autoComplete, placeholder }: {
  value: string; onChange: (v: string) => void; label?: string; autoComplete: string; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`${inputClass} pr-10`}
          required
        />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

function SignedOut() {
  const { login, signup, googleLogin, config } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const googleRef = useRef<HTMLDivElement>(null)

  const switchMode = (next: Mode) => { setMode(next); setError(null); setNotice(null) }

  const onGoogle = React.useCallback(async (credential: string) => {
    setBusy(true)
    const result = await googleLogin(credential, invite || undefined, accepted)
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Google sign-in failed.')
  }, [googleLogin, invite, accepted])
  useGoogleButton(config.googleClientId, onGoogle, googleRef, mode !== 'forgot')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await fetch('/api/auth/forgot-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
        })
        setNotice('If that email has an account, a reset link is on its way.')
        return
      }
      const result = mode === 'signin'
        ? await login(email, password)
        : await signup({ email, password, name: name || undefined, inviteCode: invite || undefined, acceptTerms: accepted })
      if (!result.ok) setError(result.error ?? 'Something went wrong.')
    } catch {
      setError('Can’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'
  const subtitle = mode === 'signup' && config.inviteRequired ? 'WinterArc is in private beta. You’ll need an invite code.' : 'Plan your days, track your threads.'

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" className={inputClass} />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus required className={inputClass} />
        </div>
        {mode !== 'forgot' && (
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? 'At least 10 characters' : undefined}
          />
        )}
        {mode === 'signup' && config.inviteRequired && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Invite code</label>
            <input value={invite} onChange={e => setInvite(e.target.value.toUpperCase())} autoCapitalize="characters" required className={`${inputClass} tracking-wider`} placeholder="WA-XXXX-XXXX" />
          </div>
        )}
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-0.5 accent-primary" />
            <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms</a> and the <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Privacy Policy</a>.</span>
          </label>
        )}
        {error && <p role="alert" className="text-xs text-destructive font-medium">{error}</p>}
        {notice && <p role="status" className="text-xs text-primary font-medium">{notice}</p>}
        <Button type="submit" className="w-full py-2.5 gap-2" disabled={busy || !email || (mode !== 'forgot' && !password) || (mode === 'signup' && !accepted)}>
          <span>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</span>
          <ArrowRight size={16} />
        </Button>
      </form>

      {config.googleClientId && mode !== 'forgot' && !isNative() && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          {mode === 'signup' && config.inviteRequired && <p className="text-[11px] text-center text-muted-foreground">Enter your invite code above first.</p>}
          <div ref={googleRef} className="flex justify-center" />
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground space-y-1.5">
        <p><a href="/terms" className="hover:underline">Terms</a> · <a href="/privacy" className="hover:underline">Privacy</a></p>
        {mode === 'signin' && (
          <>
            <button type="button" className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => switchMode('forgot')}>Forgot your password?</button>
            <p>New here? <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode('signup')}>Create an account</button></p>
          </>
        )}
        {mode !== 'signin' && (
          <p>{mode === 'signup' ? 'Already have an account?' : 'Remembered it?'} <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode('signin')}>Sign in</button></p>
        )}
      </div>
    </AuthShell>
  )
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isChecking, user } = useAuth()
  if (isChecking) return <div className="min-h-screen w-full bg-background" />
  // `onboarded` is undefined for a cached user from before this existed; only an explicit false triggers setup
  if (isAuthenticated && user?.onboarded === false) return <OnboardingPage />
  if (isAuthenticated) return <>{children}</>
  return <SignedOut />
}
