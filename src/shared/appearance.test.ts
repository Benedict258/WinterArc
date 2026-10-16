import { describe, it, expect } from 'vitest'
import { MODULE_IDS, ACCENTS, normalizeAppearance, normalizeModules, accentById, DEFAULT_APPEARANCE } from './appearance'

describe('appearance and modules', () => {
  it('falls back to defaults for missing or bad values', () => {
    expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ mode: 'neon' as any, accent: 'nope', density: 'tiny' as any })).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ mode: 'system', accent: 'rose', density: 'compact' })).toEqual({ mode: 'system', accent: 'rose', density: 'compact' })
  })
  it('modules are on unless explicitly off', () => {
    expect(Object.values(normalizeModules(undefined)).every(v => v === true)).toBe(true)
    expect(Object.keys(normalizeModules(undefined)).sort()).toEqual([...MODULE_IDS].sort())
    expect(normalizeModules({ drop: false })).toMatchObject({ drop: false, wishlist: true })
  })
  it('accent ids are unique and resolvable', () => {
    expect(new Set(ACCENTS.map(a => a.id)).size).toBe(ACCENTS.length)
    expect(accentById('violet').label).toBe('Violet')
    expect(accentById('zzz').id).toBe('lime')
  })
})
