import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ToolDefinition } from '@/lib/llm/engine'
import { initSession, listTools, type McpSession } from './mcpClient'

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
  startPolling: (id: string) => void
  stopPolling: (id: string) => void
}

const _polls: Map<string, ReturnType<typeof setInterval>> = new Map()

function setServerState(
  set: (fn: (s: McpStoreState) => Partial<McpStoreState>) => void,
  id: string,
  patch: Partial<McpServer>,
) {
  set((s) => ({
    servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv)),
  }))
}

async function connectServer(
  set: (fn: (s: McpStoreState) => Partial<McpStoreState>) => void,
  id: string,
  url: string,
) {
  try {
    const session = await initSession(url)
    const tools = await listTools(session)
    setServerState(set, id, { status: 'connected', tools, session, errorMsg: undefined })
    const poll = _polls.get(id)
    if (poll) {
      clearInterval(poll)
      _polls.delete(id)
    }
  } catch (err) {
    setServerState(set, id, {
      status: 'error',
      errorMsg: err instanceof Error ? err.message : String(err),
    })
    throw err
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
        try {
          await connectServer(set, id, url)
        } catch {
          get().startPolling(id)
        }
      },

      removeServer: (id) => {
        const poll = _polls.get(id)
        if (poll) {
          clearInterval(poll)
          _polls.delete(id)
        }
        set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }))
      },

      reconnect: async (id) => {
        const srv = get().servers.find((s) => s.id === id)
        if (!srv) return
        setServerState(set, id, { status: 'connecting', errorMsg: undefined })
        try {
          await connectServer(set, id, srv.url)
        } catch {
          get().startPolling(id)
        }
      },

      startPolling: (id) => {
        if (_polls.has(id)) return
        const srv = get().servers.find((s) => s.id === id)
        if (!srv) return
        const poll = setInterval(async () => {
          try {
            await connectServer(set, id, srv.url)
          } catch { /* still waiting */ }
        }, 2000)
        _polls.set(id, poll)
      },

      stopPolling: (id) => {
        const poll = _polls.get(id)
        if (poll) {
          clearInterval(poll)
          _polls.delete(id)
        }
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
    },
  ),
)
