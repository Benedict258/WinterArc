import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { assertTenantFilter, isUserIdValue } from './tenant'

describe('tenant guard', () => {
  const id = new mongoose.Types.ObjectId()

  it('accepts ObjectIds and 24-hex strings', () => {
    expect(isUserIdValue(id)).toBe(true)
    expect(isUserIdValue(String(id))).toBe(true)
  })
  it('rejects missing, undefined, operator and malformed values', () => {
    for (const bad of [undefined, null, '', 'abc', {}, { $ne: id }, { $exists: true }, 5]) {
      expect(isUserIdValue(bad)).toBe(false)
    }
  })
  it('throws for a filter without userId, passes with it', () => {
    expect(() => assertTenantFilter('Task', 'find', {}, {})).toThrow(/Tenant guard/)
    expect(() => assertTenantFilter('Task', 'find', { userId: undefined, status: 'x' }, {})).toThrow()
    expect(() => assertTenantFilter('Task', 'find', { userId: id }, {})).not.toThrow()
  })
  it('allows an explicit crossUser opt-in', () => {
    expect(() => assertTenantFilter('Task', 'find', {}, { crossUser: true })).not.toThrow()
  })
})
