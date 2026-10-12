import crypto from 'crypto'
import { google, calendar_v3 } from 'googleapis'
import { CalendarSync } from '../models/CalendarSync'
import { Settings } from '../models/Settings'
import { Task } from '../models/Task'
import { DEFAULT_TIMEZONE, toDayKey, dayKeyToDate, addDaysKey, dateToDayKey } from './dailyGenerationService'
import { googleEventToTask, taskToGoogleEvent, syncWindow } from './calendarMapping'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']
const STATE_TTL_MS = 10 * 60 * 1000

export const calendarConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

function redirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const origin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '')
  return `${origin}/api/calendar/callback`
}

function oauthClient() {
  if (!calendarConfigured()) throw new Error('Google Calendar credentials are not configured on the server')
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri())
}

// The OAuth callback is hit by Google's redirect, possibly in a browser with no
// login, so the request is tied to us with a short-lived signed state instead.
const sign = (payload: string) => crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-secret').update(payload).digest('hex')

export function createState(now = Date.now()) {
  const payload = `${crypto.randomBytes(8).toString('hex')}.${now}`
  return `${payload}.${sign(payload)}`
}

export function verifyState(state: string, now = Date.now()) {
  const [nonce, issued, mac] = state.split('.')
  if (!nonce || !issued || !mac) return false
  const expected = sign(`${nonce}.${issued}`)
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false
  return now - Number(issued) <= STATE_TTL_MS
}

export function getAuthUrl() {
  return oauthClient().generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent', state: createState() })
}

export async function handleCallback(code: string) {
  const client = oauthClient()
  const { tokens } = await client.getToken(code)
  const existing = await CalendarSync.findOne()
  const data = {
    accessToken: tokens.access_token ?? undefined,
    // Google only returns a refresh token on first consent; keep the old one otherwise
    refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? undefined,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
  }
  if (existing) await CalendarSync.updateOne({ _id: existing._id }, { $set: data })
  else await CalendarSync.create(data)
}

export const disconnect = () => CalendarSync.deleteMany({})

async function getClient(): Promise<calendar_v3.Calendar> {
  const sync = await CalendarSync.findOne()
  if (!sync?.accessToken && !sync?.refreshToken) throw new Error('Google Calendar not connected')
  const client = oauthClient()
  client.setCredentials({ access_token: sync.accessToken, refresh_token: sync.refreshToken, expiry_date: sync.expiresAt?.getTime() })
  // Persist refreshed access tokens
  client.on('tokens', async tokens => {
    await CalendarSync.updateOne({ _id: sync._id }, { $set: {
      ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
    } })
  })
  return google.calendar({ version: 'v3', auth: client })
}

/** Raw Google events for one local day (for the "from your calendar" list on Today). */
export async function eventsForDay(dayKey: string, timeZone: string) {
  const calendar = await getClient()
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(`${dayKey}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDaysKey(dayKey, 1)}T00:00:00Z`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone,
  })
  return (res.data.items ?? []).filter(e => e.start?.dateTime)
}

export type SyncResult = { imported: number; updated: number; removed: number; pushed: number; lastSyncedAt: Date }

/**
 * Two-way sync of event tasks over the next two weeks.
 *  - Google → app: timed events become event tasks (created, updated, or removed when deleted/cancelled).
 *  - app → Google: event tasks created here get a Google event; later edits are patched.
 * Events this app pushed are marked so they are never imported back.
 */
export async function syncCalendar(now = new Date()): Promise<SyncResult> {
  const calendar = await getClient()
  const settings = await Settings.findOne()
  const timeZone = settings?.timezone || DEFAULT_TIMEZONE
  const { startKey, endKey } = syncWindow(toDayKey(now, timeZone))
  const windowStart = dayKeyToDate(startKey)
  const windowEnd = dayKeyToDate(addDaysKey(endKey, 1))
  const lastSync = (await CalendarSync.findOne())?.lastSyncedAt ?? new Date(0)
  const result = { imported: 0, updated: 0, removed: 0, pushed: 0 }

  // ---- Google → app
  const listed = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date(`${startKey}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDaysKey(endKey, 1)}T00:00:00Z`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
    timeZone,
  })
  const seen = new Set<string>()
  for (const event of listed.data.items ?? []) {
    const fields = googleEventToTask(event, timeZone)
    if (!fields) continue
    seen.add(fields.calendarEventId)
    const existing = await Task.findOne({ calendarEventId: fields.calendarEventId })
    const values = { title: fields.title, date: fields.date, startTime: fields.startTime, endTime: fields.endTime, timeBlock: fields.timeBlock }
    if (!existing) {
      await Task.create({ ...values, calendarEventId: fields.calendarEventId, isEvent: true, source: 'google-calendar', intensity: 'light', status: 'pending' })
      result.imported++
    } else if (existing.source === 'google-calendar') {
      const changed = existing.title !== values.title || existing.startTime !== values.startTime || existing.endTime !== values.endTime ||
        dateToDayKey(existing.date as Date) !== fields.dayKey
      if (changed) {
        await Task.updateOne({ _id: existing._id }, { $set: values })
        result.updated++
      }
    }
  }
  // Deleted on Google → remove the pending imported copy
  const stale = await Task.deleteMany({
    source: 'google-calendar', status: 'pending', date: { $gte: windowStart, $lt: windowEnd },
    calendarEventId: { $nin: [...seen], $ne: null },
  })
  result.removed = stale.deletedCount ?? 0

  // ---- app → Google
  const mine = await Task.find({
    isEvent: true, source: { $ne: 'google-calendar' }, status: { $ne: 'skipped' },
    startTime: { $ne: null }, date: { $gte: windowStart, $lt: windowEnd },
  })
  for (const task of mine) {
    const body = taskToGoogleEvent({ _id: task._id, title: task.title, startTime: task.startTime!, endTime: task.endTime }, dateToDayKey(task.date as Date), timeZone)
    if (!task.calendarEventId) {
      const created = await calendar.events.insert({ calendarId: 'primary', requestBody: body })
      await Task.updateOne({ _id: task._id }, { $set: { calendarEventId: created.data.id } })
      result.pushed++
    } else if ((task as any).updatedAt > lastSync) {
      await calendar.events.patch({ calendarId: 'primary', eventId: task.calendarEventId, requestBody: body }).catch(() => {})
      result.pushed++
    }
  }

  const lastSyncedAt = new Date()
  await CalendarSync.updateOne({}, { $set: { lastSyncedAt } })
  return { ...result, lastSyncedAt }
}

/** Remove the Google copy of an event that was deleted here. Best effort. */
export async function deleteRemoteEvent(calendarEventId: string) {
  try {
    const calendar = await getClient()
    await calendar.events.delete({ calendarId: 'primary', eventId: calendarEventId })
  } catch { /* not connected, or already gone */ }
}

/** Sync if connected and the last sync is older than `maxAgeMs` (used by the scheduler). */
export async function syncIfStale(maxAgeMs = 15 * 60 * 1000) {
  if (!calendarConfigured()) return null
  const sync = await CalendarSync.findOne()
  if (!sync || (!sync.accessToken && !sync.refreshToken)) return null
  if (sync.lastSyncedAt && Date.now() - sync.lastSyncedAt.getTime() < maxAgeMs) return null
  return syncCalendar()
}
