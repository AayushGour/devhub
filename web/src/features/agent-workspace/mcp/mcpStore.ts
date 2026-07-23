import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ToolDefinition } from '@/lib/llm/engine'
import {
  initSession,
  initSessionSse,
  sseUrlCandidates,
  closeSseSession,
  listTools as listMcpTools,
  type McpSession,
} from '@/lib/mcp/client'
import type { McpTool } from '@/lib/mcp/types'

// Adapt the raw MCP tool shape (`@/lib/mcp/types`) to the LLM-facing
// `ToolDefinition` wrapper this store's consumers (useAgentTools, callWithTools)
// expect. mcp-studio consumes the raw `McpTool` shape directly — this adapter
// is agent-workspace-only.
function toToolDefinition(t: McpTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }
}

export interface McpServer {
  id: string
  name: string
  url: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  errorMsg?: string
  tools: ToolDefinition[]
  session?: McpSession
}

interface McpStoreState {
  servers: McpServer[]
  addServer: (name: string, url: string) => Promise<void>
  removeServer: (id: string) => void
  reconnect: (id: string) => Promise<void>
}

type SetFn = (fn: (s: McpStoreState) => Partial<McpStoreState>) => void
type GetFn = () => McpStoreState

const POLL_INTERVAL_MS = 2000

// `_connecting` holds the ids of servers with a connect attempt currently in
// flight; `_polls` holds the pending "try again later" timer per server. Together
// they guarantee retries run STRICTLY sequentially: at most one attempt per server
// at a time, and the next attempt is only scheduled once the current one settles.
const _connecting = new Set<string>()
const _polls = new Map<string, ReturnType<typeof setTimeout>>()

function cancelPoll(id: string) {
  const t = _polls.get(id)
  if (t) {
    clearTimeout(t)
    _polls.delete(id)
  }
}

function setServerState(set: SetFn, id: string, patch: Partial<McpServer>) {
  set((s) => ({
    servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv)),
  }))
}

async function connectServer(set: SetFn, id: string, url: string) {
  // One ordered list of (transport, url) attempts, tried one after another. Each
  // `await` blocks until that single candidate resolves or fails, so within an
  // attempt the candidates are probed sequentially — never in parallel. Streamable
  // HTTP on the given URL first, then SSE candidates (most-likely-correct first).
  // We only stop on a fully valid handshake, so a bogus 200 can't shadow the rest.
  const attempts: Array<{ kind: 'http' | 'sse'; url: string }> = [
    { kind: 'http', url },
    ...sseUrlCandidates(url).map((u) => ({ kind: 'sse' as const, url: u })),
  ]

  let session: McpSession | undefined
  const errors: string[] = []

  for (const a of attempts) {
    try {
      console.log(`[mcp] trying ${a.kind.toUpperCase()} ${a.url}`)
      session = a.kind === 'http' ? (await initSession(a.url)).session : (await initSessionSse(a.url)).session
      console.log(`[mcp] connected via ${a.kind.toUpperCase()} ${a.url}`)
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[mcp] ${a.kind.toUpperCase()} ${a.url} failed: ${msg}`)
      errors.push(`${a.kind.toUpperCase()}(${a.url}): ${msg}`)
    }
  }

  if (!session) {
    const errorMsg = errors.join(' | ')
    setServerState(set, id, { status: 'error', errorMsg })
    throw new Error(errorMsg)
  }

  // A server can initialize fine yet answer tools/list with a JSON-RPC error
  // (e.g. it only advertises prompts/resources). Treat that as "no tools" and
  // still mark the server connected — otherwise the whole connection is stuck
  // retrying forever.
  let mcpTools: McpTool[] = []
  try {
    mcpTools = await listMcpTools(session)
  } catch (err) {
    console.log(`[mcp] tools/list failed; connecting with no tools: ${err instanceof Error ? err.message : String(err)}`)
  }
  const tools = mcpTools.map(toToolDefinition)
  setServerState(set, id, { status: 'connected', tools, session, errorMsg: undefined })
}

// Run a single connect attempt for one server, guarding against overlap and
// scheduling the next retry only after this attempt has fully settled. This is
// the heart of the sequential-retry behaviour — it replaces the old setInterval
// that fired new attempts before the previous one had finished.
async function attemptConnect(set: SetFn, get: GetFn, id: string) {
  if (_connecting.has(id)) return // an attempt is already running for this server
  const srv = get().servers.find((s) => s.id === id)
  if (!srv) return

  cancelPoll(id) // we are attempting right now; drop any queued retry timer
  _connecting.add(id)
  setServerState(set, id, { status: 'connecting', errorMsg: undefined })

  try {
    await connectServer(set, id, srv.url)
    // success — connectServer set status 'connected'; leave no retry scheduled
  } catch {
    // Schedule the next attempt only if the server still exists. setTimeout (not
    // setInterval) means exactly one future attempt is queued, and it can't start
    // until this function has returned and cleared `_connecting`.
    if (get().servers.some((s) => s.id === id)) {
      _polls.set(id, setTimeout(() => { void attemptConnect(set, get, id) }, POLL_INTERVAL_MS))
    }
  } finally {
    _connecting.delete(id)
  }
}

export const useMcpStore = create<McpStoreState>()(
  persist(
    (set, get) => ({
      servers: [],

      addServer: async (name, url) => {
        const id = crypto.randomUUID()
        set((s) => ({
          servers: [
            ...s.servers,
            { id, name, url, status: 'connecting', tools: [] },
          ],
        }))
        // attemptConnect self-schedules retries on failure (sequentially).
        await attemptConnect(set, get, id)
      },

      removeServer: (id) => {
        cancelPoll(id)
        _connecting.delete(id)
        const srv = get().servers.find((s) => s.id === id)
        if (srv?.session) closeSseSession(srv.session.serverUrl)
        set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }))
      },

      reconnect: async (id) => {
        cancelPoll(id) // cancel any queued retry; attempt now
        await attemptConnect(set, get, id)
      },
    }),
    {
      name: 'devhub-mcp-servers',
      partialize: (s) => ({
        servers: s.servers.map(({ session: _session, ...rest }) => ({
          ...rest,
          status: 'disconnected' as const,
          tools: [],
        })),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        for (const srv of state.servers) {
          state.reconnect(srv.id).catch(() => {})
        }
      },
    },
  ),
)
