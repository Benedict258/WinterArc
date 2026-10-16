import { Health } from '@capgo/capacitor-health'
import { App } from '@capacitor/app'
import { isNative } from './native'

// Reads steps, weight and resting heart rate from Health Connect (Android) and sends daily totals to the account.
// Nothing else is read, and nothing is written back to Health Connect.

const FLAG = 'winterarc.health.connected'
const LAST = 'winterarc.health.last'
const THROTTLE_MS = 15 * 60_000
export const HEALTH_SYNCED = 'winterarc-health-synced'

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

export const healthSupported = () => isNative()
export const healthConnected = () => get(FLAG) === '1'

export async function healthAvailability(): Promise<{ available: boolean; reason?: string }> {
  if (!isNative()) return { available: false, reason: 'Open the Android app to sync steps from your phone or watch.' }
  try {
    const r = await Health.isAvailable()
    return { available: !!r.available, reason: r.reason }
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : 'Health Connect isn’t available on this device.' }
  }
}

/** Asks Health Connect for read access to steps, weight and resting heart rate, then does a first sync. */
export async function connectHealth(): Promise<{ ok: boolean; message?: string }> {
  const a = await healthAvailability()
  if (!a.available) return { ok: false, message: a.reason ?? 'Health Connect isn’t available on this device.' }
  try {
    await Health.requestAuthorization({ read: ['steps', 'weight', 'restingHeartRate'], write: [] })
    const status = await Health.checkAuthorization({ read: ['steps', 'weight', 'restingHeartRate'], write: [] })
    if (!(status.readAuthorized ?? []).includes('steps')) return { ok: false, message: 'Step access wasn’t allowed. You can allow it in Health Connect settings.' }
    put(FLAG, '1')
    await syncHealth(30, true)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t connect to Health Connect.' }
  }
}

export function disconnectHealth() { put(FLAG, null); put(LAST, null) }

const post = (body: unknown) => fetch('/api/fitness/sync', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Sends the last `days` days of daily totals. Safe to repeat: the server replaces device values for those days. */
export async function syncHealth(days = 14, force = false): Promise<{ ok: boolean; message?: string }> {
  if (!isNative() || !healthConnected()) return { ok: false, message: 'Not connected' }
  const last = Number(get(LAST) ?? 0)
  if (!force && Date.now() - last < THROTTLE_MS) return { ok: true }
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1))
  const range = { startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day' as const }
  try {
    const [steps, weight, hr] = await Promise.all([
      Health.queryAggregated({ dataType: 'steps', ...range, aggregation: 'sum' }),
      Health.queryAggregated({ dataType: 'weight', ...range, aggregation: 'average' }).catch(() => ({ samples: [] as { startDate: string; value: number }[] })),
      Health.queryAggregated({ dataType: 'restingHeartRate', ...range, aggregation: 'average' }).catch(() => ({ samples: [] as { startDate: string; value: number }[] })),
    ])
    const metrics = new Map<string, { day: string; weightKg?: number; restingHr?: number }>()
    for (const s of weight.samples) if (s.value > 0) metrics.set(localDay(new Date(s.startDate)), { ...metrics.get(localDay(new Date(s.startDate))), day: localDay(new Date(s.startDate)), weightKg: s.value })
    for (const s of hr.samples) if (s.value > 0) metrics.set(localDay(new Date(s.startDate)), { ...metrics.get(localDay(new Date(s.startDate))), day: localDay(new Date(s.startDate)), restingHr: Math.round(s.value) })
    const res = await post({
      steps: steps.samples.map(s => ({ day: localDay(new Date(s.startDate)), steps: Math.round(s.value) })).filter(s => s.steps >= 0),
      metrics: [...metrics.values()],
    })
    if (!res.ok) return { ok: false, message: 'Couldn’t reach the server. Will try again.' }
    put(LAST, String(Date.now()))
    window.dispatchEvent(new Event(HEALTH_SYNCED))
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Sync failed' }
  }
}

/** Sync on launch and whenever the app comes back to the front. */
export function startHealthSync() {
  if (!isNative()) return
  void syncHealth()
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) void syncHealth() })
}
