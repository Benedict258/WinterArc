import type { NextFunction, Request, Response } from 'express'

// A small in-memory limiter for the public connector endpoints (one process; fine for this scale).
const buckets = new Map<string, number[]>()
export const resetLimits = () => buckets.clear()

/** True when `key` has used up `max` hits in the last `windowMs` (and records this hit). */
export function hit(key: string, max: number, windowMs: number, now = Date.now()) {
  if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMITS_IN_TEST !== '1') return false
  const recent = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (!v.some(t => now - t < windowMs)) buckets.delete(k)
  return recent.length > max
}

export const limitByIp = (name: string, max: number, windowMs: number) => (req: Request, res: Response, next: NextFunction) => {
  if (hit(`${name}:${req.ip}`, max, windowMs)) return res.status(429).set('Retry-After', String(Math.ceil(windowMs / 1000))).json({ error: 'too_many_requests', error_description: 'Slow down and try again later.' })
  next()
}
