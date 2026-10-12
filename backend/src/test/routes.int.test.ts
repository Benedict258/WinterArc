import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { User } from '../models/User'

const available = await dbReachable()

type Route = { method: string; path: string }

/** Every route the app registers, with its full path (Express 4 keeps routers as layers with a mount regexp). */
function collectRoutes(app: any): Route[] {
  const out: Route[] = []
  const mountOf = (layer: any) => {
    const src: string = layer.regexp.source
    if (src === '^\\/?(?=\\/|$)') return ''
    return src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/')
  }
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          for (const p of [].concat(layer.route.path)) out.push({ method: method.toUpperCase(), path: prefix + p })
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountOf(layer))
      }
    }
  }
  walk(app._router.stack, '')
  return out
}

/** Paths that are meant to work without signing in. Everything else under /api must answer 401. */
const PUBLIC = [/^\/api\/auth\//, /^\/api\/health$/, /^\/api\/cron\/tick$/, /^\/api\/calendar\/callback$/, /^\/api\/email\/unsubscribe$/, /^\/api\/billing\/webhook$/]

describe.skipIf(!available)('every route is protected', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let routes: Route[]
  beforeAll(async () => { ctx = await startTestApp(); routes = collectRoutes(ctx.app).filter(r => r.path.startsWith('/api/')) })
  afterAll(async () => { await ctx.stop() })

  const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, '000000000000000000000000')

  it('finds the routes (guards against the walker silently seeing none)', () => {
    expect(routes.length).toBeGreaterThan(100)
    for (const p of ['/api/threads', '/api/tasks', '/api/admin/users', '/api/ai/chat', '/api/partners/:id/progress', '/api/teams/:id/tasks/:taskId', '/api/billing/webhook', '/api/import/winterarc', '/api/account/delete', '/api/drop/upload-url']) {
      expect(routes.some(r => r.path === p), p).toBe(true)
    }
  })

  it('answers 401 to a signed-out caller on every non-public route', async () => {
    const failures: string[] = []
    for (const r of routes) {
      if (PUBLIC.some(re => re.test(r.path))) continue
      const res = await (request(ctx.app) as any)[r.method.toLowerCase()](concrete(r.path)).send({})
      if (res.status !== 401) failures.push(`${r.method} ${r.path} -> ${res.status}`)
    }
    expect(failures).toEqual([])
  })

  it('keeps admin routes for admins only', async () => {
    const member = await signedUpAgent(ctx, 'routes-member@example.com')
    const failures: string[] = []
    for (const r of routes.filter(x => x.path.startsWith('/api/admin/'))) {
      const res = await (member.agent as any)[r.method.toLowerCase()](concrete(r.path)).send({})
      if (res.status !== 403) failures.push(`${r.method} ${r.path} -> ${res.status}`)
    }
    expect(failures).toEqual([])
  })

  it('keeps email-confirmed-only features closed to unconfirmed accounts', async () => {
    const fresh = await signedUpAgent(ctx, 'routes-unconfirmed@example.com', { verify: false })
    const failures: string[] = []
    for (const r of routes.filter(x => /^\/api\/(ai|partners|teams)(\/|$)/.test(x.path))) {
      const res = await (fresh.agent as any)[r.method.toLowerCase()](concrete(r.path)).send({})
      if (res.status !== 403) failures.push(`${r.method} ${r.path} -> ${res.status}`)
    }
    expect(failures).toEqual([])
    await User.updateOne({ _id: fresh.userId }, { $set: { status: 'suspended' } })
    expect((await fresh.agent.get('/api/threads')).status).toBe(401) // suspended accounts are signed out everywhere
  })

  it('public routes do not leak data or accept junk', async () => {
    expect((await request(ctx.app).get('/api/health')).status).toBe(200)
    expect((await request(ctx.app).get('/api/cron/tick')).status).toBe(401)
    expect((await request(ctx.app).get('/api/cron/tick?key=wrong')).status).toBe(401)
    expect((await request(ctx.app).get('/api/email/unsubscribe?u=bad&s=bad')).status).toBe(400)
    expect((await request(ctx.app).post('/api/billing/webhook').send({ event: 'charge.success', data: { reference: 'x' } })).status).toBe(401)
    expect((await request(ctx.app).get('/api/auth/me')).body).toEqual({ authenticated: false })
    // nothing sensitive in the public config
    const config = (await request(ctx.app).get('/api/auth/config')).body
    expect(Object.keys(config).sort()).toEqual(['aiProvider', 'googleClientId', 'inviteRequired', 'jurisdiction', 'legalName', 'supportEmail', 'termsVersion'])
  })
})
