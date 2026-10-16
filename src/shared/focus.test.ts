import { describe, it, expect } from 'vitest'
import { DEFAULT_FOCUS_PREFS as P, normalizeFocusPrefs, initialTimer, start, pause, reset, complete, skip, remainingMs, hasEnded, formatClock, withPrefs, phaseMs } from './focus'

const T0 = 1_000_000

describe('focus timer', () => {
  it('clamps preferences', () => {
    expect(normalizeFocusPrefs(undefined)).toEqual(P)
    expect(normalizeFocusPrefs({ focusMin: 0, shortMin: 999, longMin: -3, longEvery: 1, autoStart: 'yes' as any })).toEqual({ focusMin: 1, shortMin: 60, longMin: 1, longEvery: 2, autoStart: false })
  })

  it('counts down and survives a pause', () => {
    let s = start(initialTimer(P), T0)
    expect(remainingMs(s, T0 + 60_000)).toBe(24 * 60_000)
    s = pause(s, T0 + 60_000)
    expect(remainingMs(s, T0 + 999_999)).toBe(24 * 60_000) // frozen while paused
    s = start(s, T0 + 2_000_000)
    expect(remainingMs(s, T0 + 2_000_000 + 1000)).toBe(24 * 60_000 - 1000)
    expect(s.startedAt).toBe(T0) // the session began at the first start
  })

  it('logs finished focus rounds only, and takes a long break every fourth', () => {
    let s = initialTimer(P)
    const logged: number[] = []
    for (let round = 1; round <= 4; round++) {
      s = start(s, T0 + round * 10_000_000)
      const done = complete(s, P, T0 + round * 10_000_000 + 1)
      if (done.finished) logged.push(done.finished.minutes)
      s = done.state
      expect(s.phase).toBe(round === 4 ? 'long' : 'short')
      expect(s.remainingMs).toBe(phaseMs(s.phase, P))
      s = start(s, T0 + round * 10_000_000 + 2)
      s = complete(s, P, T0 + round * 10_000_000 + 3).state // the break ends, nothing logged
      expect(s.phase).toBe('focus')
    }
    expect(logged).toEqual([25, 25, 25, 25])
    expect(s.focusDone).toBe(4)
  })

  it('auto-starts the next phase when asked', () => {
    const prefs = { ...P, autoStart: true }
    const { state } = complete(start(initialTimer(prefs), T0), prefs, T0 + 5)
    expect(state.status).toBe('running')
    expect(state.phase).toBe('short')
  })

  it('skipping a focus round does not count it; skipping a break moves on', () => {
    const running = start(initialTimer(P), T0)
    const skippedFocus = skip(running, P, T0 + 10)
    expect(skippedFocus.phase).toBe('focus')
    expect(skippedFocus.focusDone).toBe(0)
    const onBreak = complete(running, P, T0 + 10).state
    expect(skip(onBreak, P, T0 + 20).phase).toBe('focus')
  })

  it('knows when a phase ended while the page was closed', () => {
    const s = start(initialTimer(P), T0)
    expect(hasEnded(s, T0 + 25 * 60_000 - 1)).toBe(false)
    expect(hasEnded(s, T0 + 25 * 60_000)).toBe(true)
    expect(hasEnded(initialTimer(P), T0 + 1e12)).toBe(false)
  })

  it('reset restarts the phase; new settings apply to an idle timer only', () => {
    const s = reset(pause(start(initialTimer(P), T0), T0 + 5000), P)
    expect(s.status).toBe('idle')
    expect(s.remainingMs).toBe(25 * 60_000)
    const longer = { ...P, focusMin: 50 }
    expect(withPrefs(s, longer).remainingMs).toBe(50 * 60_000)
    const running = start(s, T0)
    expect(withPrefs(running, longer)).toBe(running)
  })

  it('formats the clock', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(59_001)).toBe('01:00')
    expect(formatClock(0)).toBe('00:00')
  })
})
