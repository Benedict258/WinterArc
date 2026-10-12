import { Capacitor } from '@capacitor/core'

/** True inside the installed Android/iOS app, false in a browser or PWA. */
export const isNative = () => Capacitor.isNativePlatform()

// Where the API lives for the native app (its pages come from https://localhost).
// Set at build time; the browser build leaves it empty and uses same-origin /api.
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

const TOKEN_KEY = 'winterarc.token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (token: string) => { try { localStorage.setItem(TOKEN_KEY, token) } catch { /* storage unavailable */ } }
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ } }

/**
 * In the native app, send relative /api calls to the real API and
 * authenticate them with the bearer token (cookies don't cross origins).
 * Call once before anything else uses fetch.
 */
export function installNativeNetworking() {
  if (!isNative() || !API_BASE) return
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith('/api/')) return originalFetch(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const { credentials: _ignored, ...rest } = init ?? {}
    return originalFetch(API_BASE + url, { ...rest, headers })
  }
}
