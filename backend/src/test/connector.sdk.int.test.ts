import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { dbReachable, startTestApp, signedUpAgent } from './harness'
import { OAuthGrant } from '../models/OAuthGrant'
import { Task } from '../models/Task'

// Runs the official MCP client library against our server: discovery, dynamic registration, PKCE, token exchange,
// automatic refresh and tool calls. If a real client can't connect, this fails.

const available = await dbReachable()

class MemoryProvider implements OAuthClientProvider {
  info: any; saved: any; verifier = ''; authUrl: URL | null = null
  constructor(private redirect: string) {}
  get redirectUrl() { return this.redirect }
  get clientMetadata() { return { client_name: 'SDK test client', redirect_uris: [this.redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'mcp:read mcp:write' } }
  clientInformation() { return this.info }
  saveClientInformation(i: any) { this.info = i }
  tokens() { return this.saved }
  saveTokens(t: any) { this.saved = t }
  redirectToAuthorization(u: URL) { this.authUrl = u }
  saveCodeVerifier(v: string) { this.verifier = v }
  codeVerifier() { return this.verifier }
}

describe.skipIf(!available)('connector with the official MCP client', () => {
  let ctx: Awaited<ReturnType<typeof startTestApp>>
  let server: Server
  let base = ''
  beforeAll(async () => {
    ctx = await startTestApp()
    server = ctx.app.listen(0, '127.0.0.1')
    await new Promise(r => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    process.env.APP_URL = base
  })
  afterAll(async () => { delete process.env.APP_URL; await new Promise(r => server.close(r)); await ctx.stop() })

  it('connects, signs in, lists and calls tools, and refreshes by itself', async () => {
    const me = await signedUpAgent(ctx, 'sdk1@example.com')
    const provider = new MemoryProvider('http://127.0.0.1:53999/callback')

    // 1. First try: no token yet. The client discovers us, registers, and asks to send the person to the consent page.
    const first = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider })
    await expect(new Client({ name: 'sdk-test', version: '1.0.0' }).connect(first)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(provider.info?.client_id).toMatch(/^wa_/)
    const url = provider.authUrl!
    expect(url.origin + url.pathname).toBe(`${base}/oauth/authorize`)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('resource')).toBe(`${base}/mcp`)

    // 2. The person approves on the consent page (we call what that page calls).
    const q = Object.fromEntries(url.searchParams.entries())
    const preview = await me.agent.get('/api/oauth/authorize/preview').query(q)
    expect(preview.status).toBe(200)
    expect(preview.body.client.name).toBe('SDK test client')
    expect(preview.body.client.loopback).toBe(true)
    const decision = await me.agent.post('/api/oauth/authorize/decision').send({ ...q, decision: 'allow', scopes: ['mcp:read', 'mcp:write'] })
    const back = new URL(decision.body.redirectTo)
    expect(back.origin + back.pathname).toBe('http://127.0.0.1:53999/callback')
    expect(back.searchParams.get('state')).toBe(q.state ?? null)

    // 3. The client swaps the code for tokens.
    await first.finishAuth(back.searchParams.get('code')!)
    expect(provider.saved.access_token).toMatch(/^wat_/)
    expect(provider.saved.refresh_token).toMatch(/^wrt_/)

    // 4. Connected: protocol handshake, tools, a write and a read.
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider })
    const client = new Client({ name: 'sdk-test', version: '1.0.0' })
    await client.connect(transport)
    expect(client.getServerVersion()?.name).toBe('winterarc')
    const { tools } = await client.listTools()
    expect(tools.length).toBeGreaterThan(25)
    expect(tools.find(t => t.name === 'log_habit')?.annotations?.readOnlyHint).toBe(false)
    const made = await client.callTool({ name: 'create_tasks', arguments: { tasks: [{ title: 'From the SDK client' }] } })
    expect(made.isError).toBeFalsy()
    expect(await Task.countDocuments({ userId: me.userId, title: 'From the SDK client' })).toBe(1)
    const bad = await client.callTool({ name: 'log_steps', arguments: { steps: -1 } })
    expect(bad.isError).toBe(true)

    // 5. The access token expires; the client refreshes it on its own and carries on.
    const before = provider.saved.access_token
    await OAuthGrant.updateOne({ userId: me.userId }, { $set: { accessExpiresAt: new Date(Date.now() - 1000) } })
    const listed = await client.callTool({ name: 'list_backlog', arguments: {} })
    expect(listed.isError).toBeFalsy()
    expect(provider.saved.access_token).not.toBe(before)
    await client.close()
  })
})
