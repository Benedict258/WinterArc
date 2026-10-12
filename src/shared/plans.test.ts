import { describe, it, expect } from 'vitest'
import { PLANS, formatBytes, isPlanId } from './plans'

describe('plans', () => {
  it('pro is more generous than free on every limit', () => {
    for (const k of Object.keys(PLANS.free.limits) as (keyof typeof PLANS.free.limits)[]) {
      expect(PLANS.pro.limits[k]).toBeGreaterThan(PLANS.free.limits[k])
    }
  })
  it('knows its plan ids', () => {
    expect(isPlanId('pro')).toBe(true)
    expect(isPlanId('enterprise')).toBe(false)
  })
  it('formats sizes', () => {
    expect(formatBytes(200 * 1024 * 1024)).toBe('200 MB')
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB')
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB')
    expect(formatBytes(900)).toBe('900 B')
  })
})
