import crypto from 'crypto'
import { OAuthClient } from '../models/OAuthClient'
import { OAuthCode } from '../models/OAuthCode'
import { OAuthGrant } from '../models/OAuthGrant'
import { User } from '../models/User'
import { appUrl } from './emailService'
import { hashToken, randomToken } from '../utils/tokens'

// Lets apps like Claude and ChatGPT ask a person for access to their WinterArc account (OAuth 2.1 with PKCE,
// as the Model Context Protocol requires). The person approves on a consent page; the app then holds tokens
// that can be revoked at any time.

export class OAuthError extends Error {
  constructor(public status: number, public code: string, description: string) { super(description) }
}

export const SCOPES = {
  'mcp:read': 'See your tasks, threads, habits, routines, workouts, meals and focus history',
  'mcp:write': 'Add and change tasks, threads, routines, habits, workouts, meals and some settings',
} as const
export type Scope = keyof typeof SCOPES
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[]

export const issuer = () => appUrl()
export const mcpUrl = () => `${appUrl()}/mcp`

const ACCESS_TTL_S = 60 * 60
const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000
const CODE_TTL_MS = 5 * 60 * 1000
const RETRY_GRACE_MS = 30_000
const MAX_GRANTS_PER_USER = 20
const MAX_CLIENTS = 20_000

export function parseScopes(raw: unknown): Scope[] {
  const asked = typeof raw === 'string' ? raw.split(/\s+/).filter(Boolean) : []
  const known = asked.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s))
  return known.length ? [...new Set(known)] : [...ALL_SCOPES]
}

// -------------------------------------------------------------- registration

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** https addresses, or http on this computer (native apps like Claude Code listen on a local port). No fragments, no credentials. */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri.length > 500) return 'redirect_uris must be strings up to 500 characters'
  let u: URL
  try { u = new URL(uri) } catch { return `“${uri.slice(0, 60)}” is not a valid address` }
  if (u.hash) return 'redirect_uris must not contain a fragment'
  if (u.username || u.password) return 'redirect_uris must not contain credentials'
  if (u.protocol === 'https:') return null
  if (u.protocol === 'http:' && LOOPBACK.has(u.hostname)) return null
  return 'redirect_uris must use https (or http on localhost)'
}

/** Exact match, except that for a registered localhost address the port may differ (RFC 8252). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  let want: URL
  try { want = new URL(requested) } catch { return false }
  if (want.protocol !== 'http:' || !LOOPBACK.has(want.hostname)) return false
  return registered.some(r => {
    try {
      const have = new URL(r)
      return have.protocol === 'http:' && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search
    } catch { return false }
  })
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : '') || 'An app'

export async function registerClient(body: any) {
  const uris = body?.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) throw new OAuthError(400, 'invalid_redirect_uri', 'Send between 1 and 10 redirect_uris.')
  for (const u of uris) { const p = redirectUriProblem(u); if (p) throw new OAuthError(400, 'invalid_redirect_uri', p) }
  if (body.grant_types !== undefined && !(Array.isArray(body.grant_types) && body.grant_types.every((g: unknown) => ['authorization_code', 'refresh_token'].includes(String(g))))) {
    throw new OAuthError(400, 'invalid_client_metadata', 'Only the authorization_code and refresh_token grants are supported.')
  }
  if ((await OAuthClient.estimatedDocumentCount()) >= MAX_CLIENTS) throw new OAuthError(503, 'temporarily_unavailable', 'Registration is full right now. Try again later.')
  const clientId = `wa_${randomToken(16)}`
  const name = cleanName(body.client_name)
  await OAuthClient.create({ clientId, name, redirectUris: [...new Set<string>(uris)] })
  return {
    client_id: clientId, client_name: name, redirect_uris: [...new Set<string>(uris)], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000),
  }
}

// ------------------------------------------------------------- authorization

export type AuthorizeParams = {
  client_id?: unknown; redirect_uri?: unknown; response_type?: unknown; code_challenge?: unknown; code_challenge_method?: unknown
  state?: unknown; scope?: unknown; resource?: unknown
}

/** A problem we must show to the person, never redirect with (the client or its redirect address can't be trusted). */
export class AuthorizePageError extends Error {}
/** A problem we send back to the app at its (verified) redirect address. */
export class AuthorizeRedirectError extends Error {
  constructor(public code: string, description: string, public redirectUri: string, public state?: string) { super(description) }
}

const B64URL = /^[A-Za-z0-9_-]+$/
// RFC 7636: a code verifier may also contain '.' and '~'
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

export async function checkAuthorizeRequest(p: AuthorizeParams) {
  if (typeof p.client_id !== 'string' || !p.client_id) throw new AuthorizePageError('This link is missing the app’s id.')
  const client = await OAuthClient.findOne({ clientId: p.client_id })
  if (!client) throw new AuthorizePageError('This app isn’t registered. Go back to the app and try connecting again.')
  if (typeof p.redirect_uri !== 'string' || !redirectMatches(client.redirectUris, p.redirect_uri)) throw new AuthorizePageError('This app asked to send you to an address it didn’t register, so we stopped.')
  // From here on the redirect address is trusted, so errors go back to the app
  const state = typeof p.state === 'string' ? p.state.slice(0, 500) : undefined
  const fail = (code: string, description: string) => new AuthorizeRedirectError(code, description, p.redirect_uri as string, state)
  if (p.response_type !== 'code') throw fail('unsupported_response_type', 'Only response_type=code is supported.')
  if (typeof p.code_challenge !== 'string' || p.code_challenge.length < 43 || p.code_challenge.length > 128 || !B64URL.test(p.code_challenge) || p.code_challenge_method !== 'S256') {
    throw fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.')
  }
  if (p.resource !== undefined && p.resource !== mcpUrl()) throw fail('invalid_target', `The resource must be ${mcpUrl()}.`)
  return { client, redirectUri: p.redirect_uri, codeChallenge: p.code_challenge, state, scopes: parseScopes(p.scope) }
}

export function redirectWith(redirectUri: string, params: Record<string, string | undefined>) {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  u.searchParams.set('iss', issuer())
  return u.toString()
}

export async function issueCode(userId: string, req: { client: { clientId: string }; redirectUri: string; codeChallenge: string }, scopes: Scope[]) {
  const code = randomToken(32)
  await OAuthCode.create({
    userId, codeHash: hashToken(code), clientId: req.client.clientId, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge,
    scopes, expiresAt: new Date(Date.now() + CODE_TTL_MS),
  })
  await OAuthClient.updateOne({ clientId: req.client.clientId }, { $set: { lastUsedAt: new Date() } })
  return code
}

// -------------------------------------------------------------------- tokens

const sha256b64url = (s: string) => crypto.createHash('sha256').update(s).digest('base64url')
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

const tokenBody = (access: string, refresh: string, scopes: string[]) => ({
  access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(' '),
})

export async function exchangeCode(p: Record<string, unknown>) {
  const { code, client_id, redirect_uri, code_verifier, resource } = p
  if (typeof code !== 'string' || typeof client_id !== 'string' || typeof redirect_uri !== 'string') throw new OAuthError(400, 'invalid_request', 'code, client_id and redirect_uri are required.')
  if (typeof code_verifier !== 'string' || !VERIFIER.test(code_verifier)) throw new OAuthError(400, 'invalid_grant', 'A valid code_verifier is required.')
  if (resource !== undefined && resource !== mcpUrl()) throw new OAuthError(400, 'invalid_target', `The resource must be ${mcpUrl()}.`)
  const client = await OAuthClient.findOne({ clientId: client_id })
  if (!client) throw new OAuthError(401, 'invalid_client', 'Unknown client.')

  const row = await OAuthCode.findOne({ codeHash: hashToken(code) }).setOptions({ crossUser: true })
  // The code is single-use: whoever deletes it first wins, so a replay finds nothing
  const claimed = row ? (await OAuthCode.deleteOne({ _id: row._id }).setOptions({ crossUser: true })).deletedCount === 1 : false
  if (!row || !claimed || row.expiresAt.getTime() < Date.now() || row.clientId !== client_id || row.redirectUri !== redirect_uri) {
    throw new OAuthError(400, 'invalid_grant', 'That authorization code is invalid, expired or already used.')
  }
  if (!safeEqual(sha256b64url(code_verifier), row.codeChallenge)) throw new OAuthError(400, 'invalid_grant', 'The code_verifier does not match.')
  const user = await User.findOne({ _id: row.userId }, { status: 1, emailVerifiedAt: 1 })
  if (!user || user.status !== 'active') throw new OAuthError(400, 'invalid_grant', 'This account can’t be connected.')

  const access = `wat_${randomToken(32)}`
  const refresh = `wrt_${randomToken(32)}`
  await OAuthGrant.create({
    userId: row.userId, clientId: client_id, clientName: client.name, scopes: row.scopes,
    accessHash: hashToken(access), accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
    refreshHash: hashToken(refresh), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
  // keep the number of live connections bounded: the oldest ones go
  const live = await OAuthGrant.find({ userId: row.userId, revokedAt: null }).sort({ createdAt: -1 }).skip(MAX_GRANTS_PER_USER).select({ _id: 1 })
  if (live.length) await OAuthGrant.updateMany({ userId: row.userId, _id: { $in: live.map(g => g._id) } }, { $set: { revokedAt: new Date() } })
  return tokenBody(access, refresh, row.scopes)
}

export async function refreshTokens(p: Record<string, unknown>) {
  const { refresh_token, client_id } = p
  if (typeof refresh_token !== 'string' || typeof client_id !== 'string') throw new OAuthError(400, 'invalid_request', 'refresh_token and client_id are required.')
  const hash = hashToken(refresh_token)
  const grant = await OAuthGrant.findOne({ $or: [{ refreshHash: hash }, { prevRefreshHash: hash }] }).setOptions({ crossUser: true })
  if (!grant || grant.clientId !== client_id || grant.revokedAt || grant.refreshExpiresAt.getTime() < Date.now()) throw new OAuthError(400, 'invalid_grant', 'That refresh token is invalid or expired.')
  // A client that never got our answer retries with the token it still has; allow that for a few seconds
  const retry = grant.refreshHash !== hash && grant.prevRefreshHash === hash && !!grant.rotatedAt && Date.now() - grant.rotatedAt.getTime() < RETRY_GRACE_MS
  if (grant.refreshHash !== hash && !retry) {
    // an old token came back: someone has a copy. End the whole grant.
    await OAuthGrant.updateOne({ _id: grant._id, userId: grant.userId }, { $set: { revokedAt: new Date() } })
    throw new OAuthError(400, 'invalid_grant', 'That refresh token was already used. The connection has been closed; connect again.')
  }
  const user = await User.findOne({ _id: grant.userId }, { status: 1 })
  if (!user || user.status !== 'active') throw new OAuthError(400, 'invalid_grant', 'This account can’t be connected.')
  const access = `wat_${randomToken(32)}`
  const refresh = `wrt_${randomToken(32)}`
  const rotated = await OAuthGrant.findOneAndUpdate(
    { _id: grant._id, userId: grant.userId, revokedAt: null, ...(retry ? { prevRefreshHash: hash } : { refreshHash: hash }) },
    { $set: { accessHash: hashToken(access), accessExpiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), refreshHash: hashToken(refresh), prevRefreshHash: hash, rotatedAt: new Date(), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS) } },
    { new: true }
  )
  if (!rotated) throw new OAuthError(400, 'invalid_grant', 'That refresh token is invalid or expired.')
  await OAuthClient.updateOne({ clientId: client_id }, { $set: { lastUsedAt: new Date() } })
  return tokenBody(access, refresh, grant.scopes)
}

export type Authenticated = { userId: string; grantId: string; scopes: Scope[]; clientName: string }

/** The account behind an access token, or null. Suspended accounts and unconfirmed emails don't get through. */
export async function verifyAccessToken(token: string): Promise<Authenticated | null> {
  if (!token.startsWith('wat_')) return null
  const grant = await OAuthGrant.findOne({ accessHash: hashToken(token) }).setOptions({ crossUser: true })
  if (!grant || grant.revokedAt || grant.accessExpiresAt.getTime() < Date.now()) return null
  const user = await User.findOne({ _id: grant.userId }, { status: 1, emailVerifiedAt: 1 })
  if (!user || user.status !== 'active' || !user.emailVerifiedAt) return null
  return { userId: String(grant.userId), grantId: String(grant._id), scopes: grant.scopes as Scope[], clientName: grant.clientName }
}

export async function recordCall(a: Authenticated) {
  await OAuthGrant.updateOne({ _id: a.grantId, userId: a.userId }, { $set: { lastUsedAt: new Date() }, $inc: { calls: 1 } })
}

// --------------------------------------------------------------- management

export async function listGrants(userId: string) {
  const rows = await OAuthGrant.find({ userId, revokedAt: null, refreshExpiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
  return rows.map(g => ({ id: String(g._id), client: g.clientName, scopes: g.scopes, connectedAt: (g as any).createdAt, lastUsedAt: g.lastUsedAt, calls: g.calls }))
}

export async function revokeGrant(userId: string, id: string) {
  const r = await OAuthGrant.updateOne({ _id: id, userId, revokedAt: null }, { $set: { revokedAt: new Date() } })
  if (r.matchedCount === 0) throw new OAuthError(404, 'not_found', 'That connection doesn’t exist.')
  return { ok: true }
}

export async function revokeAll(userId: string) {
  await OAuthGrant.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } })
}

export function authorizationServerMetadata() {
  const base = issuer()
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/privacy`,
  }
}

export function protectedResourceMetadata() {
  return {
    resource: mcpUrl(),
    authorization_servers: [issuer()],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'WinterArc',
    resource_documentation: `${issuer()}/settings`,
  }
}
