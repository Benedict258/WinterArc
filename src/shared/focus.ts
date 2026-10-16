// Pomodoro timer: a small state machine with no clock of its own (callers pass "now"),
// so it behaves the same on the server, in the browser and in tests.

export type FocusPrefs = { focusMin: number; shortMin: number; longMin: number; longEvery: number; autoStart: boolean }
export const DEFAULT_FOCUS_PREFS: FocusPrefs = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: false }

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

export function normalizeFocusPrefs(raw: Partial<FocusPrefs> | null | undefined): FocusPrefs {
  return {
    focusMin: clampInt(raw?.focusMin, 1, 180, DEFAULT_FOCUS_PREFS.focusMin),
    shortMin: clampInt(raw?.shortMin, 1, 60, DEFAULT_FOCUS_PREFS.shortMin),
    longMin: clampInt(raw?.longMin, 1, 120, DEFAULT_FOCUS_PREFS.longMin),
    longEvery: clampInt(raw?.longEvery, 2, 10, DEFAULT_FOCUS_PREFS.longEvery),
    autoStart: raw?.autoStart === true,
  }
}

export type Phase = 'focus' | 'short' | 'long'
export type TimerState = {
  phase: Phase
  status: 'idle' | 'running' | 'paused'
  /** epoch ms the phase ends, while running */
  endsAt: number | null
  /** ms left, while idle or paused */
  remainingMs: number
  /** focus rounds finished since the last long break */
  focusDone: number
  /** epoch ms the current focus phase first started (for the history) */
  startedAt: number | null
  /** what the person is working on, if they said */
  taskId: string | null
  label: string
}

export const phaseMs = (phase: Phase, prefs: FocusPrefs) =>
  (phase === 'focus' ? prefs.focusMin : phase === 'short' ? prefs.shortMin : prefs.longMin) * 60_000

export const initialTimer = (prefs: FocusPrefs): TimerState => ({
  phase: 'focus', status: 'idle', endsAt: null, remainingMs: phaseMs('focus', prefs), focusDone: 0, startedAt: null, taskId: null, label: '',
})

export const remainingMs = (s: TimerState, now: number) =>
  s.status === 'running' && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remainingMs

export function start(s: TimerState, now: number): TimerState {
  if (s.status === 'running') return s
  return {
    ...s, status: 'running', endsAt: now + s.remainingMs,
    startedAt: s.phase === 'focus' ? (s.startedAt ?? now) : s.startedAt,
  }
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s
  return { ...s, status: 'paused', endsAt: null, remainingMs: remainingMs(s, now) }
}

/** Back to the start of the current phase (the history is untouched). */
export function reset(s: TimerState, prefs: FocusPrefs): TimerState {
  return { ...s, status: 'idle', endsAt: null, remainingMs: phaseMs(s.phase, prefs), startedAt: null }
}

export function nextPhase(s: Pick<TimerState, 'phase' | 'focusDone'>, prefs: FocusPrefs): { phase: Phase; focusDone: number } {
  if (s.phase !== 'focus') return { phase: 'focus', focusDone: s.focusDone }
  const done = s.focusDone + 1
  return { phase: done % prefs.longEvery === 0 ? 'long' : 'short', focusDone: done }
}

export type Finished = { startedAt: number; minutes: number; taskId: string | null; label: string }

/** Move to the next phase. `finished` is set only when a focus phase ran to its end. */
export function complete(s: TimerState, prefs: FocusPrefs, now: number): { state: TimerState; finished: Finished | null } {
  const finished: Finished | null = s.phase === 'focus'
    ? { startedAt: s.startedAt ?? now - phaseMs('focus', prefs), minutes: prefs.focusMin, taskId: s.taskId, label: s.label }
    : null
  const n = nextPhase(s, prefs)
  const base: TimerState = { ...s, ...n, status: 'idle', endsAt: null, remainingMs: phaseMs(n.phase, prefs), startedAt: null }
  return { state: prefs.autoStart ? start(base, now) : base, finished }
}

/** Skip the rest of a break (a skipped focus round is not counted). */
export function skip(s: TimerState, prefs: FocusPrefs, now: number): TimerState {
  if (s.phase === 'focus') return { ...s, status: 'idle', endsAt: null, phase: 'focus', remainingMs: phaseMs('focus', prefs), startedAt: null }
  return complete(s, prefs, now).state
}

/** After a reload: a phase that ended while the page was closed is finished, not resumed. */
export const hasEnded = (s: TimerState, now: number) => s.status === 'running' && s.endsAt !== null && s.endsAt <= now

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  return `${String(m).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Applies new settings to an idle timer; a running one keeps its length until the phase ends. */
export function withPrefs(s: TimerState, prefs: FocusPrefs): TimerState {
  return s.status === 'idle' ? { ...s, remainingMs: phaseMs(s.phase, prefs) } : s
}
