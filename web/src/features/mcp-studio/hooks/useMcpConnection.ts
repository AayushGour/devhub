// Owns the connect/disconnect/reconnect lifecycle for mcp-studio. Keeps
// `mcpStudioStore` a plain state container (like agent-workspace's mcpStore)
// while this hook does the actual transport orchestration + capability-gated
// discovery, so ConnectionForm/ConnectionRail/McpToolbar stay thin.

import { useCallback } from 'react'
import {
  initSession,
  initSessionSse,
  sseUrlCandidates,
  closeSseSession,
  listTools,
  listPrompts,
  listResources,
  listResourceTemplates,
} from '@/lib/mcp/client'
import type { McpSession, InitializeResult } from '@/lib/mcp/types'
import { useMcpStudioStore } from '../store/mcpStudioStore'
import type {
  Connection,
  ConnectionRuntime,
  AuthConfig,
  CustomHeaderRow,
  Protocol,
  ConnectErrorKind,
  CapabilityKind,
} from '../types'
import { McpConnectError } from '../types'

function buildHeaders(auth: AuthConfig, customHeaders: CustomHeaderRow[]): Record<string, string> {
  const headers: Record<string, string> = {}
  if (auth.mode === 'bearer' && auth.token.trim()) {
    headers['Authorization'] = `Bearer ${auth.token.trim()}`
  }
  for (const row of customHeaders) {
    if (row.key.trim()) headers[row.key.trim()] = row.value
  }
  return headers
}

// Browsers surface CORS failures and plain network-down as the same generic
// "Failed to fetch" TypeError with no HTTP status — indistinguishable from
// script, so CORS is the most useful (and most common, per design doc) guess.
function classifyConnectError(err: unknown): { kind: ConnectErrorKind; message: string } {
  const raw = err instanceof Error ? err.message : String(err)
  if (/invalid url/i.test(raw)) {
    return { kind: 'bad-url', message: 'That doesn\'t look like a valid URL.' }
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return {
      kind: 'cors',
      message: 'Connection failed — most likely CORS: the server must send Access-Control-Allow-Origin for this origin. Could also be unreachable.',
    }
  }
  if (/not a valid mcp initialize response/i.test(raw)) {
    return {
      kind: 'not-mcp',
      message: 'The server responded, but not with a valid MCP initialize result — check the URL points at an MCP endpoint.',
    }
  }
  if (/timeout/i.test(raw)) {
    return { kind: 'timeout', message: raw }
  }
  return { kind: 'unknown', message: raw }
}

interface EstablishResult {
  transport: 'http' | 'sse'
  session: McpSession
  initResult: InitializeResult
}

// Try streamable-HTTP and/or SSE candidates in order (gated by `protocol`),
// stopping at the first fully valid handshake — mirrors agent-workspace's
// mcpStore connect-attempt loop, extended with per-connection auth headers.
async function runAttempts(
  url: string,
  protocol: Protocol,
  headers: Record<string, string>,
  accessToken?: string,
): Promise<EstablishResult> {
  const attempts: Array<{ kind: 'http' | 'sse'; run: () => Promise<{ session: McpSession; initResult: InitializeResult }> }> = []

  if (protocol === 'http' || protocol === 'auto') {
    attempts.push({ kind: 'http', run: () => initSession(url, headers) })
  }
  if (protocol === 'sse' || protocol === 'auto') {
    for (const sseUrl of sseUrlCandidates(url, accessToken)) {
      attempts.push({ kind: 'sse', run: () => initSessionSse(sseUrl, headers) })
    }
  }

  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      const { session, initResult } = await attempt.run()
      return { transport: attempt.kind, session, initResult }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  throw new Error(errors.join(' | ') || 'No transport candidates available')
}

async function discoverCapability<T>(
  id: string,
  kind: CapabilityKind,
  supported: boolean,
  fetchFn: () => Promise<T[]>,
  setRuntime: (id: string, patch: Partial<ConnectionRuntime>) => void,
) {
  if (!supported) {
    setRuntime(id, { [kind]: { status: 'unsupported', items: [] } } as Partial<ConnectionRuntime>)
    return
  }
  setRuntime(id, { [kind]: { status: 'loading', items: [] } } as Partial<ConnectionRuntime>)
  try {
    const items = await fetchFn()
    setRuntime(id, { [kind]: { status: 'loaded', items } } as Partial<ConnectionRuntime>)
  } catch (err) {
    setRuntime(id, {
      [kind]: { status: 'error', items: [], error: err instanceof Error ? err.message : String(err) },
    } as Partial<ConnectionRuntime>)
  }
}

export function useMcpConnection() {
  const upsertConnection = useMcpStudioStore((s) => s.upsertConnection)
  const removeConnectionState = useMcpStudioStore((s) => s.removeConnection)
  const setActiveConnection = useMcpStudioStore((s) => s.setActiveConnection)
  const setRuntime = useMcpStudioStore((s) => s.setRuntime)
  const resetRuntime = useMcpStudioStore((s) => s.resetRuntime)
  const clearRuntime = useMcpStudioStore((s) => s.clearRuntime)

  // Capability-gated discovery: only call `*/list` for primitives the server
  // actually advertised in `initialize`'s capabilities. Resource templates ride
  // the `resources` capability — MCP has no separate flag for them.
  const runDiscovery = useCallback(
    async (id: string, session: McpSession, initResult: InitializeResult) => {
      const caps = initResult.capabilities ?? {}
      await Promise.all([
        discoverCapability(id, 'tools', !!caps.tools, () => listTools(session), setRuntime),
        discoverCapability(id, 'prompts', !!caps.prompts, () => listPrompts(session), setRuntime),
        discoverCapability(id, 'resources', !!caps.resources, () => listResources(session), setRuntime),
        discoverCapability(id, 'templates', !!caps.resources, () => listResourceTemplates(session), setRuntime),
      ])
    },
    [setRuntime],
  )

  const establish = useCallback(
    async (id: string, conn: Connection) => {
      setRuntime(id, { status: 'connecting', errorMsg: undefined })
      const headers = buildHeaders(conn.auth, conn.headers)
      const accessToken = conn.auth.mode === 'bearer' ? conn.auth.token.trim() || undefined : undefined
      try {
        const { transport, session, initResult } = await runAttempts(conn.url, conn.protocol, headers, accessToken)
        setRuntime(id, { status: 'connected', errorMsg: undefined, usedTransport: transport, session, initResult })
        await runDiscovery(id, session, initResult)
      } catch (err) {
        const { kind, message } = classifyConnectError(err)
        setRuntime(id, { status: 'error', errorMsg: message })
        throw new McpConnectError(kind, message)
      }
    },
    [setRuntime, runDiscovery],
  )

  // Connects a brand-new server. Only added to the persisted "recent servers"
  // list (and made active) on SUCCESS — a failed attempt shouldn't clutter the
  // rail (see design doc data flow, step 7).
  const connect = useCallback(
    async (input: {
      label: string
      url: string
      protocol: Protocol
      auth: AuthConfig
      headers: CustomHeaderRow[]
    }): Promise<string> => {
      const id = crypto.randomUUID()
      const connection: Connection = { id, ...input }
      try {
        await establish(id, connection)
      } catch (err) {
        // Discard the runtime entirely — this id was never added to `connections`,
        // so resetRuntime would leave an orphan runtime nothing can ever clean up.
        clearRuntime(id)
        throw err
      }
      upsertConnection(connection)
      setActiveConnection(id)
      return id
    },
    [establish, clearRuntime, upsertConnection, setActiveConnection],
  )

  // Re-attempts a previously-saved connection (ConnectionRail's retry button,
  // or restoring a persisted entry after reload). The connection meta itself is
  // untouched — only its runtime (session/discovery) is (re)built.
  const reconnect = useCallback(
    async (id: string) => {
      const conn = useMcpStudioStore.getState().connections.find((c) => c.id === id)
      if (!conn) throw new Error(`Unknown connection: ${id}`)
      // Close any existing live session first so its EventSource + _sseStates entry
      // aren't leaked/orphaned when establish() opens a fresh one.
      const prev = useMcpStudioStore.getState().runtimes[id]
      if (prev?.session) closeSseSession(prev.session.serverUrl)
      await establish(id, conn)
    },
    [establish],
  )

  // Tears down the live session for a connection without forgetting it — it
  // stays in the "recent servers" rail, just shown as disconnected.
  const disconnect = useCallback(
    (id: string) => {
      const runtime = useMcpStudioStore.getState().runtimes[id]
      if (runtime?.session) closeSseSession(runtime.session.serverUrl)
      resetRuntime(id)
      if (useMcpStudioStore.getState().activeConnectionId === id) setActiveConnection(null)
    },
    [resetRuntime, setActiveConnection],
  )

  // Forgets a connection entirely (ConnectionRail's remove button).
  const removeConnection = useCallback(
    (id: string) => {
      const runtime = useMcpStudioStore.getState().runtimes[id]
      if (runtime?.session) closeSseSession(runtime.session.serverUrl)
      removeConnectionState(id)
    },
    [removeConnectionState],
  )

  return { connect, disconnect, reconnect, removeConnection }
}
