import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { processQueue, clearQueue } from '@/lib/syncQueue'
import { clearCache } from '@/lib/storage'
import { isNative, setToken, clearToken } from '@/lib/native'

export type AuthUser = { id: string; email: string; name: string; role: 'user' | 'admin'; emailVerified: boolean; onboarded?: boolean }
export type AuthConfig = { inviteRequired: boolean; googleClientId: string | null; supportEmail?: string | null; aiProvider?: string | null }
type Result = { ok: boolean; error?: string; code?: string }
export type SignupInput = { email: string; password: string; name?: string; inviteCode?: string; acceptTerms: boolean }

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  /** true until the first /api/auth/me check finishes */
  isChecking: boolean
  config: AuthConfig
  login: (email: string, password: string) => Promise<Result>
  signup: (input: SignupInput) => Promise<Result>
  googleLogin: (credential: string, inviteCode?: string, acceptTerms?: boolean) => Promise<Result>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  resendVerification: () => Promise<Result>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Remembers who was signed in on this device, so the app still opens with no
// internet (the password can't be checked offline). The server still enforces
// the session on every API call; this only decides what to show.
const USER_KEY = 'winterarc.user'
const readUser = (): AuthUser | null => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
}
const writeUser = (user: AuthUser | null) => {
  try { user ? localStorage.setItem(USER_KEY, JSON.stringify(user)) : localStorage.removeItem(USER_KEY) } catch { /* storage unavailable */ }
}

// Any 401 from the API (expired session, suspended account, password reset on
// another device) drops the user back to the sign-in screen instead of silently
// showing stale cached data.
let onUnauthorized: (() => void) | null = null
let fetchPatched = false
// Bumped on every successful login. A request sent before the latest login
// (e.g. the offline queue replaying) may come back 401 afterwards — that must
// not sign out the freshly signed-in user.
let authEpoch = 0

function patchFetchFor401() {
  if (fetchPatched || typeof window === 'undefined') return
  fetchPatched = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const epochAtSend = authEpoch
    const response = await originalFetch(input, init)
    if (response.status === 401 && epochAtSend === authEpoch) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = new URL(url, window.location.origin).pathname
      if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) onUnauthorized?.()
    }
    return response
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [config, setConfig] = useState<AuthConfig>({ inviteRequired: true, googleClientId: null })

  const forget = useCallback(async () => {
    writeUser(null)
    clearToken()
    try { Object.keys(localStorage).filter(k => k.startsWith('winterarc.ai.')).forEach(k => localStorage.removeItem(k)) } catch { /* storage unavailable */ }
    await Promise.all([clearCache(), clearQueue().catch(() => {})])
    queryClient.clear()
    setUser(null)
  }, [queryClient])

  useEffect(() => {
    patchFetchFor401()
    onUnauthorized = () => { void forget() }
    fetch('/api/auth/config').then(r => r.json()).then(setConfig).catch(() => {})
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.authenticated && d.user) {
          writeUser(d.user)
          setUser(d.user)
        } else {
          void forget()
        }
      })
      // Network failure (offline / server asleep): stay signed in as before
      .catch(() => setUser(readUser()))
      .finally(() => setIsChecking(false))
    return () => { onUnauthorized = null }
  }, [forget])

  /** After a successful sign-in: wipe cached data if a different person was using this device. */
  const adopt = async (next: AuthUser, token?: string) => {
    const previous = readUser()
    if (previous && previous.id !== next.id) {
      await Promise.all([clearCache(), clearQueue().catch(() => {})])
      queryClient.clear()
    }
    authEpoch++
    if (token) setToken(token)
    writeUser(next)
    setUser(next)
    // Replay anything queued while signed out/offline, now with a valid session
    processQueue().catch(console.error)
  }

  const authenticate = async (path: string, body: Record<string, unknown>): Promise<Result> => {
    try {
      const res = await fetch(path, json({
        ...body,
        client: isNative() ? 'native' : 'web',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || 'Something went wrong. Please try again.', code: data.code }
      if (isNative() && !data.token) return { ok: false, error: 'Sign-in failed. Please try again.' }
      await adopt(data.user, data.token)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Can’t reach the server. Check your connection and try again.' }
    }
  }

  const login = (email: string, password: string) => authenticate('/api/auth/login', { email, password })
  const signup = (input: SignupInput) => authenticate('/api/auth/signup', { ...input })
  const googleLogin = (credential: string, inviteCode?: string, acceptTerms?: boolean) => authenticate('/api/auth/google', { credential, inviteCode, acceptTerms })

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    await forget()
  }

  const refreshUser = async () => {
    const d = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => null)
    if (d?.authenticated && d.user) {
      writeUser(d.user)
      setUser(d.user)
    }
  }

  const resendVerification = async (): Promise<Result> => {
    const res = await fetch('/api/auth/resend-verification', json({})).catch(() => null)
    if (!res) return { ok: false, error: 'Can’t reach the server.' }
    return res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => ({}))).error || 'Please try again later.' }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isChecking, config, login, signup, googleLogin, logout, refreshUser, resendVerification }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
