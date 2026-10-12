import { describe, it, expect } from 'vitest'
import { DEFAULT_BLOCKS, blocksProblem, normalizeBlocks, blockForTime, pickBlock, resolveBlock, blockRange } from './dayBlocks'

const w = { light: 0, medium: 0, heavy: 0 }
const mk = (...starts: number[]) => starts.map((start, i) => ({ id: `b${i}`, label: `Block ${i}`, start, weights: w }))

describe('day blocks', () => {
  it('accepts 2 to 6 ordered blocks and rejects the rest', () => {
    expect(blocksProblem(DEFAULT_BLOCKS)).toBeNull()
    expect(blocksProblem(mk(6, 12))).toBeNull()
    expect(blocksProblem(mk(1, 4, 8, 12, 16, 20))).toBeNull()
    expect(blocksProblem(mk(6))).toMatch(/2 to 6/)
    expect(blocksProblem(mk(1, 3, 5, 7, 9, 11, 13))).toMatch(/2 to 6/)
    expect(blocksProblem(mk(12, 6))).toMatch(/in order/)
    expect(blocksProblem(mk(6, 6))).toMatch(/in order/)
    expect(blocksProblem(mk(6, 24))).toMatch(/0 to 23/)
    expect(blocksProblem([{ ...mk(6)[0] }, { ...mk(9)[0] }])).toMatch(/unique/)
    expect(blocksProblem([{ ...mk(6)[0], id: 'unscheduled' }, mk(9)[0]])).toMatch(/id/)
    expect(blocksProblem([{ ...mk(6)[0], label: '' }, mk(9)[0]])).toMatch(/name/)
    expect(blocksProblem('nope')).toBeTruthy()
  })

  it('falls back to the defaults for bad data', () => {
    expect(normalizeBlocks(undefined)).toBe(DEFAULT_BLOCKS)
    expect(normalizeBlocks(mk(9, 3))).toBe(DEFAULT_BLOCKS)
    expect(normalizeBlocks(mk(6, 12)).map(b => b.id)).toEqual(['b0', 'b1'])
  })

  it('finds the block for a time; early times belong to the first block', () => {
    const blocks = mk(6, 12, 18)
    expect(blockForTime('03:00', blocks)).toBe('b0')
    expect(blockForTime('11:59', blocks)).toBe('b0')
    expect(blockForTime('12:00', blocks)).toBe('b1')
    expect(blockForTime('23:30', blocks)).toBe('b2')
    expect(blockForTime(null, blocks)).toBe('b0')
  })

  it('picks the least loaded, most preferred block', () => {
    const blocks = [{ ...mk(6)[0], weights: { light: 0, medium: 0, heavy: 3 } }, { ...mk(12)[0], id: 'b1', weights: { light: 1, medium: 1, heavy: 0 } }]
    expect(pickBlock({ b0: 0, b1: 0 }, 'heavy', blocks)).toBe('b1')
    expect(pickBlock({ b0: 0, b1: 0 }, 'light', blocks)).toBe('b0')
    expect(pickBlock({ b0: 0, b1: 5 }, 'heavy', blocks)).toBe('b0')
  })

  it('re-homes tasks from blocks that no longer exist', () => {
    const blocks = mk(6, 15)
    expect(resolveBlock('b1', blocks)).toBe('b1')
    expect(resolveBlock('unscheduled', blocks)).toBe('unscheduled')
    expect(resolveBlock(null, blocks)).toBe('unscheduled')
    expect(resolveBlock('morning', blocks)).toBe('b0') // 09:00
    expect(resolveBlock('evening', blocks)).toBe('b1') // 19:00
    expect(resolveBlock('deleted-block', blocks)).toBe('b0')
  })

  it('describes ranges', () => {
    expect(blockRange(DEFAULT_BLOCKS, 0)).toBe('6 AM – 12 PM')
    expect(blockRange(DEFAULT_BLOCKS, 2)).toBe('from 5 PM')
  })
})

import { focusOf, weightsForFocus } from './dayBlocks'
describe('block focus', () => {
  it('round-trips and reads template weights', () => {
    for (const f of ['heavy', 'medium', 'light', 'any'] as const) expect(focusOf(weightsForFocus(f))).toBe(f)
    expect(focusOf({ light: 2, medium: 0, heavy: 0 })).toBe('heavy') // tie → heavier
    expect(focusOf({ light: 1, medium: 0, heavy: 4 })).toBe('medium')
  })
})
