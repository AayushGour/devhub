import type { ToolDefinition } from '@/lib/llm/engine'

export interface McpSession {
  sessionId: string
  serverUrl: string
}

interface SseState {
  es: EventSource
  waiters: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
}

// Keyed by messagesUrl (the POST endpoint derived from SSE endpoint event)
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

function mcpHeaders(sessionId: string): Record<string, string> {
  const h: Record<string, string> = {
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
export function sseUrlCandidates(mcpUrl: string): string[] {
  const seen = new Set<string>()
  const add = (u: URL) => { u.search = ''; seen.add(u.href) }
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
    seen.add(mcpUrl)
    seen.add(mcpUrl.replace(/\/[^/]*$/, '/sse'))
    seen.add(mcpUrl.replace(/\/?$/, '/sse'))
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

// Unified RPC call: handles both streamable-HTTP and SSE transports
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
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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
    headers: mcpHeaders(session.sessionId),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`MCP request failed: ${res.status}`)
  const ct = res.headers.get('Content-Type') ?? ''
  return ct.includes('text/event-stream') ? readSseResult(res) : res.json()
}

export async function initSession(serverUrl: string): Promise<McpSession> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (initData as any)?.result
  if (!result || (!result.protocolVersion && !result.serverInfo && !result.capabilities)) {
    throw new Error('Not a valid MCP initialize response (HTTP transport)')
  }

  const sessionId = res.headers.get('Mcp-Session-Id') ?? ''

  await fetch(serverUrl, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })

  return { sessionId, serverUrl }
}

export async function initSessionSse(sseUrl: string): Promise<McpSession> {
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
          const waiter = waiters.get(data?.id)
          if (waiter) {
            waiters.delete(data.id)
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

      const session: McpSession = { sessionId: '', serverUrl: messagesUrl }

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
        const initRes = await fetch(messagesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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
        if (initRes.status !== 202 && initCt.includes('application/json')) {
          // Response came back in the POST body — drop the SSE waiter and use it.
          waiters.delete(1)
          await initRes.json()
        } else {
          // Response is delivered over the SSE stream (waiter registered above).
          await initWaiter
        }

        // Notification — no response expected
        await fetch(messagesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        })

        resolve(session)
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

export async function listTools(session: McpSession): Promise<ToolDefinition[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await rpcCall(session, { jsonrpc: '2.0', method: 'tools/list', id: nextRpcId() }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = data?.result?.tools ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tools.map((t: any): ToolDefinition => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }))
}

export async function callTool(
  session: McpSession,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await rpcCall(session, {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: nextRpcId(),
    params: { name, arguments: args },
  }) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (data as any)?.result?.content
  if (Array.isArray(content) && content.length > 0) {
    return content.map((c: { text?: string }) => c.text ?? '').join('\n')
  }
  return JSON.stringify(data)
}
