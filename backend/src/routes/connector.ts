import express, { Router, type Express, type Request, type Response } from 'express'
import { uid } from '../middleware/auth'
import { hit, limitByIp } from '../utils/rateLimit'
import {
  AuthorizePageError, AuthorizeRedirectError, OAuthError, SCOPES, authorizationServerMetadata, checkAuthorizeRequest, exchangeCode, issueCode, issuer, listGrants, mcpUrl,
  parseScopes, protectedResourceMetadata, redirectWith, refreshTokens, registerClient, revokeGrant, verifyAccessToken, type Scope,
} from '../services/oauthService'
import { handleMessage } from '../services/mcpServer'
import { User } from '../models/User'

// The public side of the connector: discovery documents, client registration, the token endpoint and the MCP endpoint
// itself (all outside /api, on the site's own address). The signed-in side (consent page, list of connections) is
// oauthConsentRouter, mounted under /api/oauth.

const noStore = (res: Response) => res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' })
const oauthFail = (res: Response, e: unknown) => {
  noStore(res)
  if (e instanceof OAuthError) return res.status(e.status).json({ error: e.code, error_description: e.message })
  console.error('OAuth error:', e instanceof Error ? e.message : e)
  return res.status(500).json({ error: 'server_error', error_description: 'Something went wrong.' })
}

/** These endpoints are called by other apps and tools, so they allow any origin. They never use cookies. */
export const openCors: express.RequestHandler = (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Accept',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
    'Access-Control-Max-Age': '600',
  })
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
}
export const connectorPaths = ['/.well-known', '/oauth/register', '/oauth/token', '/mcp']

const connectorEnabled = () => process.env.MCP_DISABLED !== 'true'

const challenge = (res: Response, error?: string) => {
  const parts = [`resource_metadata="${issuer()}/.well-known/oauth-protected-resource"`]
  if (error) parts.unshift(`error="${error}"`)
  res.set('WWW-Authenticate', `Bearer ${parts.join(', ')}`)
}

export function mountConnector(app: Express) {
  const off: express.RequestHandler = (_req, res, next) => (connectorEnabled() ? next() : (res.status(404).json({ error: 'not_found' }), undefined))

  const meta = (build: () => object): express.RequestHandler => (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300').json(build())
  }
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], off, meta(protectedResourceMetadata))
  app.get('/.well-known/oauth-authorization-server', off, meta(authorizationServerMetadata))

  app.post('/oauth/register', off, limitByIp('oauth-register', 30, 3600_000), async (req, res) => {
    try {
      noStore(res)
      res.status(201).json(await registerClient(req.body))
    } catch (e) {
      if (e instanceof OAuthError && e.code === 'invalid_redirect_uri') return res.status(400).json({ error: e.code, error_description: e.message })
      oauthFail(res, e)
    }
  })

  app.post('/oauth/token', off, limitByIp('oauth-token', 120, 15 * 60_000), express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
    try {
      noStore(res)
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
      if (body.grant_type === 'authorization_code') return res.json(await exchangeCode(body))
      if (body.grant_type === 'refresh_token') return res.json(await refreshTokens(body))
      throw new OAuthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.')
    } catch (e) {
      oauthFail(res, e)
    }
  })

  // ---- MCP endpoint (Streamable HTTP, JSON responses, no sessions)
  app.post('/mcp', off, async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    const header = req.get('authorization') ?? ''
    const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1]
    const auth = token ? await verifyAccessToken(token).catch(() => null) : null
    if (!auth) {
      challenge(res, token ? 'invalid_token' : undefined)
      return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to WinterArc to use this connector.' } })
    }
    if (hit(`mcp:${auth.grantId}`, Number(process.env.MCP_CALLS_PER_MINUTE) || 120, 60_000)) return res.status(429).set('Retry-After', '30').json({ jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Too many requests. Wait a moment.' } })
    const body = req.body
    if (body === undefined || body === null || typeof body !== 'object') return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Send a JSON-RPC message.' } })
    const messages = Array.isArray(body) ? body.slice(0, 20) : [body]
    if (messages.length === 0) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty batch' } })
    const out = (await Promise.all(messages.map(m => handleMessage(m, auth)))).filter((r): r is object => r !== null)
    if (out.length === 0) return res.status(202).end()
    res.json(Array.isArray(body) ? out : out[0])
  })
  app.all('/mcp', off, (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed', error_description: 'This server only accepts POST.' }))
}

// ------------------------------------------------------------ consent (signed in)

export const oauthConsentRouter = Router()

const pick = (src: any) => ({
  client_id: src.client_id, redirect_uri: src.redirect_uri, response_type: src.response_type, code_challenge: src.code_challenge,
  code_challenge_method: src.code_challenge_method, state: src.state, scope: src.scope, resource: src.resource,
})
const hostOf = (uri: string) => { try { return new URL(uri).host } catch { return uri } }

oauthConsentRouter.get('/authorize/preview', async (req, res) => {
  try {
    if (!connectorEnabled()) return res.status(404).json({ error: 'Connections to other apps are switched off on this server.' })
    const r = await checkAuthorizeRequest(pick(req.query))
    const user = await User.findOne({ _id: uid(req) }, { email: 1 })
    res.json({
      client: { name: r.client.name, redirectHost: hostOf(r.redirectUri), loopback: /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(hostOf(r.redirectUri)) },
      scopes: r.scopes.map(id => ({ id, label: SCOPES[id] })), email: user?.email ?? '',
    })
  } catch (e) {
    if (e instanceof AuthorizePageError) return res.status(400).json({ error: e.message })
    if (e instanceof AuthorizeRedirectError) return res.status(400).json({ error: e.message })
    console.error('Authorize preview failed:', e instanceof Error ? e.message : e)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

oauthConsentRouter.post('/authorize/decision', async (req, res) => {
  try {
    if (!connectorEnabled()) return res.status(404).json({ error: 'Connections to other apps are switched off on this server.' })
    if (hit(`oauth-decision:${uid(req)}`, 30, 3600_000)) return res.status(429).json({ error: 'Too many attempts. Try again later.' })
    let r
    try {
      r = await checkAuthorizeRequest(pick(req.body ?? {}))
    } catch (e) {
      // the app's redirect address was verified, so tell the app what went wrong
      if (e instanceof AuthorizeRedirectError) return res.json({ redirectTo: redirectWith(e.redirectUri, { error: e.code, error_description: e.message, state: e.state }) })
      throw e
    }
    if (req.body?.decision !== 'allow') return res.json({ redirectTo: redirectWith(r.redirectUri, { error: 'access_denied', error_description: 'The person declined.', state: r.state }) })
    // the person may grant less than was asked (for example read-only), never more
    const chosen = (Array.isArray(req.body.scopes) ? req.body.scopes : []).filter((s: unknown): s is Scope => typeof s === 'string' && (r.scopes as string[]).includes(s))
    const scopes = parseScopes(chosen.join(' '))
    if (chosen.length === 0) return res.status(400).json({ error: 'Pick at least one permission, or decline.' })
    const code = await issueCode(uid(req), r, scopes)
    res.json({ redirectTo: redirectWith(r.redirectUri, { code, state: r.state }) })
  } catch (e) {
    if (e instanceof AuthorizePageError || e instanceof AuthorizeRedirectError) return res.status(400).json({ error: e.message })
    console.error('Authorize decision failed:', e instanceof Error ? e.message : e)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})

oauthConsentRouter.get('/grants', async (req, res) => {
  res.json({ mcpUrl: mcpUrl(), enabled: connectorEnabled(), grants: await listGrants(uid(req)) })
})

oauthConsentRouter.delete('/grants/:id', async (req, res) => {
  try {
    res.json(await revokeGrant(uid(req), req.params.id))
  } catch (e) {
    if (e instanceof OAuthError) return res.status(e.status).json({ error: e.message })
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
})
