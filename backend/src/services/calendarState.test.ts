import { describe, it, expect } from 'vitest'
import { createState, verifyState } from './calendarService'

const USER = '65f1c0ffee0000000000abcd'

describe('OAuth state', () => {
  it('accepts a fresh state and returns the user it was issued for', () => {
    expect(verifyState(createState(USER))).toBe(USER)
  })
  it('rejects tampered, malformed and expired states', () => {
    const state = createState(USER, 1_000)
    expect(verifyState(state.replace(/.$/, c => (c === '0' ? '1' : '0')), 1_000)).toBeNull()
    expect(verifyState('nope')).toBeNull()
    expect(verifyState(state, 1_000 + 11 * 60 * 1000)).toBeNull()
  })
  it('cannot be re-pointed at another user', () => {
    const parts = createState(USER).split('.')
    parts[2] = '65f1c0ffee0000000000dcba'
    expect(verifyState(parts.join('.'))).toBeNull()
  })
})
