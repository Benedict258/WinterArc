import { describe, it, expect } from 'vitest'
import { createState, verifyState } from './calendarService'

describe('OAuth state', () => {
  it('accepts a fresh state', () => {
    expect(verifyState(createState())).toBe(true)
  })
  it('rejects tampered, malformed and expired states', () => {
    const state = createState(1_000)
    expect(verifyState(state.replace(/.$/, c => (c === '0' ? '1' : '0')), 1_000)).toBe(false)
    expect(verifyState('nope')).toBe(false)
    expect(verifyState(state, 1_000 + 11 * 60 * 1000)).toBe(false)
  })
})
