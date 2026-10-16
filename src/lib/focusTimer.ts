import {
  DEFAULT_FOCUS_PREFS, complete, hasEnded, initialTimer, pause, remainingMs, reset, skip, start, withPrefs,
  type Finished, type FocusPrefs, type Phase, type TimerState,
} from '@/shared/focus'
import { cancelTimerEnd, scheduleTimerEnd } from './focusNative'

// One timer for the whole app. It lives outside React so it keeps running while you move between
// pages, survives a reload (the end time is stored, not a countdown) and logs each finished focus round.

const KEY = 'winterarc.focus.v1'
const DEVICE_KEY = 'winterarc.device'

type Stored = { state: TimerState; pending: PendingSession[] }
type PendingSession = Finished & { clientId: string }

let prefs: FocusPrefs = DEFAULT_FOCUS_PREFS
let state: TimerState = initialTimer(prefs)
let pending: PendingSession[] = []
let version = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()
export const FOCUS_LOGGED = 'focus-logged'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null
    if (raw?.state && typeof raw.state.remainingMs === 'number') { state = raw.state; pending = Array.isArray(raw.pending) ? raw.pending : [] }
  } catch { /* storage unavailable or corrupt: start fresh */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ state, pending } satisfies Stored)) } catch { /* private mode */ }
}
function emit() { version += 1; save(); listeners.forEach(l => l()) }

const deviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch { return 'dev' }
}

export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.25, 0.5].forEach(t => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = 880; g.gain.value = 0.15
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch { /* no audio available */ }
}

const PHASE_TEXT: Record<Phase, { title: string; body: string }> = {
  focus: { title: 'Focus round done', body: 'Nice work. Take a break.' },
  short: { title: 'Break over', body: 'Ready for the next round?' },
  long: { title: 'Long break over', body: 'Ready for the next round?' },
}
function announce(phase: Phase) {
  beep()
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(PHASE_TEXT[phase].title, { body: PHASE_TEXT[phase].body, icon: '/logo.png', tag: 'winterarc-focus' })
  } catch { /* some browsers only allow notifications from a service worker */ }
}

let flushing: Promise<void> | null = null
/** Uploads finished rounds that haven't been saved yet. One upload at a time, so a round is never sent twice at once. */
export function flushPending(): Promise<void> {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null })
  return flushing
}

async function doFlush() {
  if (pending.length === 0) return
  const batch = [...pending]
  for (const p of batch) {
    try {
      const res = await fetch('/api/focus/sessions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startedAt: new Date(p.startedAt).toISOString(), minutes: p.minutes, taskId: p.taskId, label: p.label, clientId: p.clientId }),
      })
      // 4xx other than "not signed in" means the server will never accept it: drop it rather than retry forever
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429)) {
        pending = pending.filter(x => x.clientId !== p.clientId)
      } else break
    } catch { break }
  }
  emit()
  window.dispatchEvent(new Event(FOCUS_LOGGED))
}

function finishPhase(now: number) {
  const ended = state.phase
  const r = complete(state, prefs, now)
  state = r.state
  if (r.finished) pending.push({ ...r.finished, clientId: `${deviceId()}-${r.finished.startedAt}` })
  announce(ended)
  if (state.status === 'running' && state.endsAt) void scheduleTimerEnd(state.endsAt, PHASE_TEXT[state.phase].title, PHASE_TEXT[state.phase].body)
  else void cancelTimerEnd()
  emit()
  void flushPending()
}

function tick() {
  const now = Date.now()
  if (hasEnded(state, now)) finishPhase(now)
  else if (state.status === 'running') { version += 1; listeners.forEach(l => l()) }
}

function ensureTicking() {
  const need = listeners.size > 0 && state.status === 'running'
  if (need && !timer) timer = setInterval(tick, 500)
  if (!need && timer) { clearInterval(timer); timer = null }
}

function askNotificationPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission() } catch { /* unsupported */ }
}

export const focusTimer = {
  subscribe(l: () => void) {
    listeners.add(l); ensureTicking()
    return () => { listeners.delete(l); ensureTicking() }
  },
  getVersion: () => version,
  getState: () => state,
  getPrefs: () => prefs,
  pendingCount: () => pending.length,
  remaining: (now = Date.now()) => remainingMs(state, now),

  init() {
    load()
    state = withPrefs(state, prefs)
    // A round that ended while the page was closed is finished now (and logged), not resumed
    if (hasEnded(state, Date.now())) finishPhase(Date.now())
    else emit()
    ensureTicking()
    window.addEventListener('online', () => void flushPending())
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick() })
    void flushPending()
  },
  setPrefs(next: FocusPrefs) { prefs = next; state = withPrefs(state, prefs); emit() },
  start() {
    askNotificationPermission()
    state = start(state, Date.now()); emit(); ensureTicking()
    if (state.endsAt) void scheduleTimerEnd(state.endsAt, PHASE_TEXT[state.phase].title, PHASE_TEXT[state.phase].body)
  },
  pause() { state = pause(state, Date.now()); void cancelTimerEnd(); emit(); ensureTicking() },
  reset() { state = reset(state, prefs); void cancelTimerEnd(); emit(); ensureTicking() },
  skip() { state = skip(state, prefs, Date.now()); void cancelTimerEnd(); emit(); ensureTicking() },
  setTask(taskId: string | null, label: string) { state = { ...state, taskId, label: label.slice(0, 80) }; emit() },
}
