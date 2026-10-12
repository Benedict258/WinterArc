import { describe, it, expect } from 'vitest'
import { createQueryClient } from './queryClient'

describe('query client', () => {
  it('never pauses requests or queued edits just because the browser says it is offline', () => {
    const defaults = createQueryClient().getDefaultOptions()
    expect(defaults.queries?.networkMode).toBe('always')
    expect(defaults.mutations?.networkMode).toBe('always')
  })
})
