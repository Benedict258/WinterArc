import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, root), 'utf8')

describe('Content-Security-Policy', () => {
  const vercel = JSON.parse(read('vercel.json'))
  const header = vercel.headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')

  it('is sent with every page and forbids inline scripts, plugins and framing', () => {
    expect(header).toBeTruthy()
    const csp: string = header.value
    expect(csp).toContain("script-src 'self' https://accounts.google.com")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('index.html has no inline scripts for the policy to block', () => {
    const html = read('index.html')
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)]
    expect(inline).toEqual([])
  })
})
