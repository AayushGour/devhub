// Shared MCP (Model Context Protocol) transport — streamable-HTTP + legacy SSE
// client for talking to arbitrary MCP servers directly from the browser.
//
// Consumed by:
//  - agent-workspace (tool-calling only) via a thin `McpTool → ToolDefinition`
//    adapter living in its own mcpStore.ts.
//  - mcp-studio (full inspect + manual invoke of tools/prompts/resources/
//    resource-templates), which uses the raw shapes below directly.
//
// This module only knows the wire protocol (see ./types for the raw MCP
// shapes) — it has no opinion on how a caller presents or gates that data.

import type {
  McpSession,
  InitializeResult,
  McpTool,
  CallToolResult,
  McpPrompt,
  GetPromptResult,
  McpResource,
  ReadResourceResult,
  McpResourceTemplate,
} from './types'

export type { McpSession }

interface SseState {
  es: EventSource
  waiters: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
}

// Keyed by messagesUrl (the POST endpoint derived from the SSE `endpoint` event)
const _sseStates = new Map<string, SseState>()

// Monotonic JSON-RPC request id. Every request MUST use a unique id: over SSE the
// response is matched back to its caller by id (via the `waiters` map), so reusing
// a fixed id (the old id=2/id=3) lets a later call clobber an earlier waiter and
// the response gets routed to the wrong promise — or lost entirely.
let _rpcId = 100
const nextRpcId = () => ++_rpcId

export function closeSseSession(serverUrl: string) {
  const state = _sseStates.get(serverUrl)
  if (state) {
    state.es.close()
    _sseStates.delete(serverUrl)
  }
}

// Base MCP protocol headers plus any per-connection custom headers (bearer auth
// + custom rows from mcp-studio's ConnectionForm). Fixed protocol headers are
// spread LAST so a user-supplied custom header row can never break the wire
// protocol (e.g. a row literally named "Accept" or "Content-Type").
function mcpHeaders(sessionId: string, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    ...extra,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (sessionId) h['Mcp-Session-Id'] = sessionId
  return h
}

// Returns ordered list of SSE URL candidates to try for a given MCP base URL,
// most-likely-correct first. The conventional MCP/SSE endpoint is `/sse` (root or
// in place of the last path segment); appending `/sse` to the full path (e.g.
// `/mcp` → `/mcp/sse`) is rarely correct, so it is the LAST resort.
//
// `accessToken` — native EventSource cannot set request headers, so a bearer
// token that needs to ride the SSE handshake is appended as `?access_token=`
// on every candidate (see design doc, "Hard browser constraints").
export function sseUrlCandidates(mcpUrl: string, accessToken?: string): string[] {
  const seen = new Set<string>()
  const add = (u: URL) => {
    u.search = ''
    if (accessToken) u.searchParams.set('access_token', accessToken)
    seen.add(u.href)
  }
  try {
    const base = new URL(mcpUrl)
    const stripped = base.pathname.replace(/\/$/, '')
    const segs = stripped.split('/')
    const lastSeg = segs[segs.length - 1]

    // 1. User already gave us an `…/sse` endpoint — try it verbatim first.
    if (lastSeg === 'sse') add(new URL(base))

    // 2. Replace the last non-empty segment with `sse` (e.g. /mcp → /sse).
    if (lastSeg && lastSeg !== 'sse') {
      const u = new URL(base)
      segs[segs.length - 1] = 'sse'
      u.pathname = segs.join('/')
      add(u)
    }

    // 3. Root-level `/sse`.
    add(new URL('/sse', base))

    // 4. The original URL as-is (covers servers whose SSE lives at a custom path).
    add(new URL(base))

    // 5. Last resort: append `/sse` to the full path (e.g. /mcp → /mcp/sse).
    const u5 = new URL(base)
    u5.pathname = stripped + '/sse'
    add(u5)
  } catch {
    const withToken = (u: string) =>
      accessToken ? `${u}${u.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}` : u
    seen.add(withToken(mcpUrl))
    seen.add(withToken(mcpUrl.replace(/\/[^/]*$/, '/sse')))
    seen.add(withToken(mcpUrl.replace(/\/?$/, '/sse')))
  }
  return [...seen]
}

async function readSseResult(res: Response): Promise<unknown> {
  const text = await res.text()
  const lines = text.split('\n').filter((l) => l.startsWith('data:'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i].slice(5).trim())
    } catch { /* keep scanning */ }
  }
  throw new Error('No parseable SSE data line found')
}

// Unified RPC call: handles both streamable-HTTP and SSE transports.
async function rpcCall(session: McpSession, body: Record<string, unknown>): Promise<unknown> {
  const sseState = _sseStates.get(session.serverUrl)
  const id = body.id as number | undefined

  if (sseState) {
    // SSE transport — register waiter before POST to avoid race condition
    const ssePromise = id !== undefined
      ? new Promise<unknown>((resolve, reject) => {
        sseState.waiters.set(id, { resolve, reject })
        setTimeout(() => {
          sseState.waiters.delete(id)
          reject(new Error('SSE response timeout (30s)'))
        }, 30000)
      })
      : Promise.resolve(null)

    const res = await fetch(session.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...session.headers },
      body: JSON.stringify(body),
    })
    if (!res.ok && res.status !== 202) throw new Error(`MCP request failed: ${res.status}`)

    // Some servers reply in the POST body even on SSE transport
    const ct = res.headers.get('Content-Type') ?? ''
    if (res.status !== 202 && ct.includes('application/json')) {
      if (id !== undefined) sseState.waiters.delete(id)
      return res.json()
    }

    return ssePromise
  }

  // Streamable HTTP transport
  const res = await fetch(session.serverUrl, {
    method: 'POST',
    headers: mcpHeaders(session.sessionId, session.headers),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`MCP request failed: ${res.status}`)
  const ct = res.headers.get('Content-Type') ?? ''
  return ct.includes('text/event-stream') ? readSseResult(res) : res.json()
}

interface JsonRpcResponse<T> {
  jsonrpc?: '2.0'
  id?: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

// Unwrap a JSON-RPC response, throwing on a top-level RPC error or a malformed
// (missing `result`) response. Tool/prompt-level failure (`CallToolResult.isError`)
// is NOT handled here — that's a normal, non-throwing result the caller/UI
// renders inline (see design doc, "Error handling").
function unwrapResult<T>(data: unknown, method: string): T {
  const res = data as JsonRpcResponse<T>
  if (res?.error) throw new Error(`MCP ${method} failed: ${res.error.message}`)
  if (res?.result === undefined) throw new Error(`MCP ${method}: malformed response (no result)`)
  return res.result
}

export async function initSession(
  serverUrl: string,
  headers: Record<string, string> = {},
): Promise<{ session: McpSession; initResult: InitializeResult }> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'devhub', version: '1.0' },
        capabilities: {},
      },
    }),
  })

  if (!res.ok) throw new Error(`MCP init failed: ${res.status}`)

  const initCt = res.headers.get('Content-Type') ?? ''
  let initData: unknown
  if (initCt.includes('text/event-stream')) {
    initData = await readSseResult(res)
  } else {
    initData = await res.json()
  }

  // Validate this is a real JSON-RPC initialize result. A plain web server (or the
  // wrong endpoint) can answer the POST with HTTP 200 and arbitrary JSON — without
  // this check that bogus success resolves a fake session and the SSE fallback
  // never runs. Require the handshake fields a genuine MCP server returns.
  const result = (initData as { result?: Partial<InitializeResult> } | undefined)?.result
  if (!result || (!result.protocolVersion && !result.serverInfo && !result.capabilities)) {
    throw new Error('Not a valid MCP initialize response (HTTP transport)')
  }

  const sessionId = res.headers.get('Mcp-Session-Id') ?? ''

  await fetch(serverUrl, {
    method: 'POST',
    headers: mcpHeaders(sessionId, headers),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })

  return { session: { sessionId, serverUrl, headers }, initResult: result as InitializeResult }
}

export async function initSessionSse(
  sseUrl: string,
  headers: Record<string, string> = {},
): Promise<{ session: McpSession; initResult: InitializeResult }> {
  return new Promise((resolve, reject) => {
    const waiters = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
    const es = new EventSource(sseUrl)

    const timer = setTimeout(() => {
      es.close()
      reject(new Error('SSE endpoint timeout after 5s'))
    }, 5000)

    es.addEventListener('endpoint', async (e) => {
      clearTimeout(timer)

      const raw = (e as MessageEvent).data as string
      const messagesUrl = (() => {
        try { return new URL(raw, sseUrl).href }
        catch { return raw }
      })()

      // Route all SSE messages to waiters
      es.onmessage = (me) => {
        try {
          const data = JSON.parse(me.data)
          // Waiters are keyed by our numeric request id. Some servers echo the id
          // back as a JSON string ("1") rather than a number — coerce so the
          // response still routes to its waiter instead of timing out.
          const rawId = data?.id
          const id = typeof rawId === 'string' ? Number(rawId) : rawId
          const waiter = waiters.get(id)
          if (waiter) {
            waiters.delete(id)
            waiter.resolve(data)
          }
        } catch { /* ignore non-JSON */ }
      }

      es.onerror = () => {
        for (const { reject: rej } of waiters.values()) {
          rej(new Error('SSE connection dropped'))
        }
        waiters.clear()
      }

      const sseState: SseState = { es, waiters }
      _sseStates.set(messagesUrl, sseState)

      const session: McpSession = { sessionId: '', serverUrl: messagesUrl, headers }

      try {
        // Register the initialize waiter BEFORE sending the POST. SSE servers
        // stream the response back over the event stream, often before (or during)
        // the POST's own resolution — if the id=1 waiter isn't registered yet that
        // message is dropped and we'd wait out the full timeout for nothing. This
        // mirrors the same register-before-POST guard rpcCall already uses.
        const initWaiter = new Promise<unknown>((res, rej) => {
          waiters.set(1, { resolve: res, reject: rej })
          setTimeout(() => {
            if (waiters.has(1)) {
              waiters.delete(1)
              rej(new Error('SSE init response timeout'))
            }
          }, 10000)
        })

        // Initialize — response may come in the POST body OR over the SSE stream.
        // These POSTs (unlike the initial EventSource handshake above) are plain
        // fetch calls, so custom headers DO reach the server here.
        const initRes = await fetch(messagesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            id: 1,
            params: {
              protocolVersion: '2025-03-26',
              clientInfo: { name: 'devhub', version: '1.0' },
              capabilities: {},
            },
          }),
        })
        if (!initRes.ok && initRes.status !== 202) throw new Error(`SSE MCP init failed: ${initRes.status}`)

        const initCt = initRes.headers.get('Content-Type') ?? ''
        let initResult: InitializeResult | undefined
        if (initRes.status !== 202 && initCt.includes('application/json')) {
          // Response came back in the POST body — drop the SSE waiter and use it.
          waiters.delete(1)
          const data = await initRes.json()
          initResult = (data as { result?: InitializeResult })?.result
        } else {
          // Response is delivered over the SSE stream (waiter registered above).
          const data = await initWaiter
          initResult = (data as { result?: InitializeResult })?.result
        }

        if (!initResult) throw new Error('Not a valid MCP initialize response (SSE transport)')

        // Notification — no response expected
        await fetch(messagesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        })

        resolve({ session, initResult })
      } catch (err) {
        es.close()
        _sseStates.delete(messagesUrl)
        reject(err)
      }
    })

    es.onerror = () => {
      clearTimeout(timer)
      es.close()
      reject(new Error('SSE connection error'))
    }
  })
}

// --- Raw MCP primitive calls -------------------------------------------------
// Every function below returns the raw wire shape (see ./types), never an
// LLM-facing wrapper.

export async function listTools(session: McpSession): Promise<McpTool[]> {
  const data = await rpcCall(session, { jsonrpc: '2.0', method: 'tools/list', id: nextRpcId() })
  const result = unwrapResult<{ tools?: McpTool[] }>(data, 'tools/list')
  return result.tools ?? []
}

export async function callTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const data = await rpcCall(session, {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: nextRpcId(),
    params: { name, arguments: args },
  })
  return unwrapResult<CallToolResult>(data, 'tools/call')
}

export async function listPrompts(session: McpSession): Promise<McpPrompt[]> {
  const data = await rpcCall(session, { jsonrpc: '2.0', method: 'prompts/list', id: nextRpcId() })
  const result = unwrapResult<{ prompts?: McpPrompt[] }>(data, 'prompts/list')
  return result.prompts ?? []
}

export async function getPrompt(
  session: McpSession,
  name: string,
  args: Record<string, string> = {},
): Promise<GetPromptResult> {
  const data = await rpcCall(session, {
    jsonrpc: '2.0',
    method: 'prompts/get',
    id: nextRpcId(),
    params: { name, arguments: args },
  })
  return unwrapResult<GetPromptResult>(data, 'prompts/get')
}

export async function listResources(session: McpSession): Promise<McpResource[]> {
  const data = await rpcCall(session, { jsonrpc: '2.0', method: 'resources/list', id: nextRpcId() })
  const result = unwrapResult<{ resources?: McpResource[] }>(data, 'resources/list')
  return result.resources ?? []
}

export async function readResource(session: McpSession, uri: string): Promise<ReadResourceResult> {
  const data = await rpcCall(session, {
    jsonrpc: '2.0',
    method: 'resources/read',
    id: nextRpcId(),
    params: { uri },
  })
  return unwrapResult<ReadResourceResult>(data, 'resources/read')
}

export async function listResourceTemplates(session: McpSession): Promise<McpResourceTemplate[]> {
  const data = await rpcCall(session, { jsonrpc: '2.0', method: 'resources/templates/list', id: nextRpcId() })
  const result = unwrapResult<{ resourceTemplates?: McpResourceTemplate[] }>(data, 'resources/templates/list')
  return result.resourceTemplates ?? []
}
