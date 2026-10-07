import React, { createContext, useContext, useState, useEffect } from 'react'
import { processQueue } from '@/lib/syncQueue'

interface AuthContextType {
  isAuthenticated: boolean
  /** true until the first /api/auth/me check finishes */
  isChecking: boolean
  login: (passcode: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Any 401 from the API (expired session, server restart without a store, …)
// drops the user back to the passcode gate instead of silently showing stale
// cached data.
let onUnauthorized: (() => void) | null = null
let fetchPatched = false
// Bumped on every successful login. A request sent before the latest login
// (e.g. the offline queue replaying while the backend wakes up) may come back
// 401 afterwards — that must not lock the freshly unlocked app.
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [isChecking, setIsChecking] = useState<boolean>(true)

  useEffect(() => {
    patchFetchFor401()
    onUnauthorized = () => setIsAuthenticated(false)
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(d => setIsAuthenticated(!!d.authenticated))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsChecking(false))
    return () => {
      onUnauthorized = null
    }
  }, [])

  const login = async (passcode: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    })
    if (res.ok) {
      authEpoch++
      setIsAuthenticated(true)
      // Replay anything queued while locked/offline, now with a valid session
      processQueue().catch(console.error)
      return { ok: true }
    }
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.error as string | undefined }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isChecking, login, logout }}>
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
