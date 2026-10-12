import { addDaysKey, dayKeyToDate } from './dailyGenerationService'

// Pure helpers for mapping between Google Calendar events and event tasks.

/** Wall-clock day and 'HH:mm' of an instant in `timeZone`. */
export function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return { dayKey: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export type GoogleEventLike = {
  id?: string | null
  status?: string | null
  summary?: string | null
  start?: { dateTime?: string | null; date?: string | null } | null
  end?: { dateTime?: string | null; date?: string | null } | null
  extendedProperties?: { private?: Record<string, string> | null } | null
}

export type EventTaskFields = {
  title: string
  date: Date
  dayKey: string
  startTime: string
  endTime: string
  timeBlock: 'morning' | 'afternoon' | 'evening'
  calendarEventId: string
}

const blockFor = (time: string): EventTaskFields['timeBlock'] => {
  const hour = Number(time.split(':')[0])
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

/**
 * Event task fields for a Google event, or null when it shouldn't be imported:
 * all-day events, cancelled events, and events this app pushed itself.
 */
export function googleEventToTask(event: GoogleEventLike, timeZone: string): EventTaskFields | null {
  if (!event.id || event.status === 'cancelled') return null
  if (event.extendedProperties?.private?.source === 'workspace') return null
  const startIso = event.start?.dateTime
  if (!startIso) return null // all-day

  const start = localParts(startIso, timeZone)
  const end = event.end?.dateTime ? localParts(event.end.dateTime, timeZone) : null
  // Events running past midnight are clipped to the end of their first day
  const endTime = end && end.dayKey === start.dayKey && end.time > start.time ? end.time : end && end.dayKey !== start.dayKey ? '23:59' : start.time

  return {
    title: event.summary?.trim() || '(no title)',
    date: dayKeyToDate(start.dayKey),
    dayKey: start.dayKey,
    startTime: start.time,
    endTime,
    timeBlock: blockFor(start.time),
    calendarEventId: event.id,
  }
}

/** Google event body for an event task (local wall time + zone, so DST and zones stay correct). */
export function taskToGoogleEvent(task: { _id: unknown; title: string; startTime: string; endTime?: string | null }, dayKey: string, timeZone: string) {
  const end = task.endTime && task.endTime > task.startTime ? task.endTime : task.startTime
  return {
    summary: task.title,
    start: { dateTime: `${dayKey}T${task.startTime}:00`, timeZone },
    end: { dateTime: `${dayKey}T${end}:00`, timeZone },
    extendedProperties: { private: { workspaceTaskId: String(task._id), source: 'workspace' } },
  }
}

/** First and last day (inclusive) of the sync window. */
export function syncWindow(todayKey: string, days = 14) {
  return { startKey: todayKey, endKey: addDaysKey(todayKey, days) }
}
