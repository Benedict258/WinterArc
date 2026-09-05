import React, { useState } from 'react'
import { Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

interface PasscodeGateProps {
  children: React.ReactNode
}

export default function PasscodeGate({ children }: PasscodeGateProps) {
  const { isAuthenticated, login } = useAuth()
  const [passcode, setPasscode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(false)

  if (isAuthenticated) {
    return <>{children}</>
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passcode) return

    const success = login(passcode.trim())
    if (!success) {
      setError(true)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-2">
              <Lock size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Workspace</h1>
            <p className="text-sm text-muted-foreground">
              Personal Task & Project System
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-xs text-muted-foreground font-medium mt-1">
              <ShieldCheck size={14} className="text-primary" />
              <span>Owner: Benedict Isaac</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">
                Passcode Gate
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value)
                    if (error) setError(false)
                  }}
                  placeholder="Enter passcode to unlock"
                  className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-sm bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                    error ? 'border-destructive focus:ring-destructive' : 'border-border'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  title={showPassword ? 'Hide passcode' : 'Show passcode'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {error && (
                <p className="text-xs text-destructive font-medium mt-1">
                  Incorrect passcode. Please try again.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full py-2.5 gap-2" disabled={!passcode}>
              <span>Unlock Workspace</span>
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="text-center space-y-1.5">
            <button
              type="button"
              onClick={() => login('BenedictIsaac#258')}
              className="text-xs text-primary hover:underline font-medium"
            >
              Quick Unlock (Default Passcode)
            </button>
            <p className="text-[11px] text-muted-foreground">
              Single-user private system • Passcode: <span className="font-mono text-[10px]">BenedictIsaac#258</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
