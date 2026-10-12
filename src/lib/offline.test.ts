import { describe, it, expect, vi, afterEach } from 'vitest'
import { newId, onlineOrQueue } from './offline'

const setOnLine = (value: boolean) => vi.stubGlobal('navigator', { onLine: value })

describe('offline helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('newId makes 24-char hex ids', () => {
    expect(newId()).toMatch(/^[0-9a-f]{24}$/)
    expect(newId()).not.toBe(newId())
  })

  it('uses the online path when it works', async () => {
    setOnLine(true)
    const offline = vi.fn()
    expect(await onlineOrQueue(async () => 'sent', offline)).toBe('sent')
    expect(offline).not.toHaveBeenCalled()
  })

  it('queues when the device reports offline', async () => {
    setOnLine(false)
    const online = vi.fn()
    expect(await onlineOrQueue(online, async () => 'queued')).toBe('queued')
    expect(online).not.toHaveBeenCalled()
  })

  it('queues when "online" but the request fails on the network', async () => {
    setOnLine(true)
    const online = async () => { throw new TypeError('Failed to fetch') }
    expect(await onlineOrQueue(online, async () => 'queued')).toBe('queued')
  })

  it('does not queue on a real server error', async () => {
    setOnLine(true)
    const online = async () => { throw new Error('Failed to create task') }
    await expect(onlineOrQueue(online, async () => 'queued')).rejects.toThrow('Failed to create task')
  })
})
