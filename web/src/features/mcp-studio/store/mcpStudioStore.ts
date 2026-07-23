// MCP Studio's own zustand+persist store. Modeled after agent-workspace's
// `mcp/mcpStore.ts` pattern but INDEPENDENT of it — no shared state, only the
// shared transport lib (`@/lib/mcp/client`) underneath.
//
// `connections` (server url/protocol/auth/label) is the only persisted slice —
// it's what ConnectionRail lists as "recent servers". `runtimes` (live session,
// initialize result, discovered tools/prompts/resources/templates) is rebuilt
// live on every connect/reconnect and is NEVER persisted.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, ConnectionRuntime } from '../types'

interface McpStudioState {
  connections: Connection[]
  activeConnectionId: string | null
  runtimes: Record<string, ConnectionRuntime>

  upsertConnection: (conn: Connection) => void
  removeConnection: (id: string) => void
  setActiveConnection: (id: string | null) => void

  /** Shallow-merge a patch into one connection's runtime (creating it if absent). */
  setRuntime: (id: string, patch: Partial<ConnectionRuntime>) => void
  resetRuntime: (id: string) => void
}

export function emptyRuntime(): ConnectionRuntime {
  return {
    status: 'disconnected',
    tools: { status: 'idle', items: [] },
    prompts: { status: 'idle', items: [] },
    resources: { status: 'idle', items: [] },
    templates: { status: 'idle', items: [] },
  }
}

export const useMcpStudioStore = create<McpStudioState>()(
  persist(
    (set) => ({
      connections: [],
      activeConnectionId: null,
      runtimes: {},

      upsertConnection: (conn) => {
        set((s) => {
          const exists = s.connections.some((c) => c.id === conn.id)
          return {
            connections: exists
              ? s.connections.map((c) => (c.id === conn.id ? conn : c))
              : [...s.connections, conn],
          }
        })
      },

      removeConnection: (id) => {
        set((s) => {
          const restRuntimes = { ...s.runtimes }
          delete restRuntimes[id]
          return {
            connections: s.connections.filter((c) => c.id !== id),
            runtimes: restRuntimes,
            activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
          }
        })
      },

      setActiveConnection: (id) => set({ activeConnectionId: id }),

      setRuntime: (id, patch) => {
        set((s) => ({
          runtimes: {
            ...s.runtimes,
            [id]: { ...(s.runtimes[id] ?? emptyRuntime()), ...patch },
          },
        }))
      },

      resetRuntime: (id) => {
        set((s) => ({ runtimes: { ...s.runtimes, [id]: emptyRuntime() } }))
      },
    }),
    {
      name: 'devhub-mcp-studio-connections',
      partialize: (s) => ({ connections: s.connections, activeConnectionId: s.activeConnectionId }),
    },
  ),
)

// --- Convenience selectors for panels (Round 2) -----------------------------

export function useActiveConnection(): Connection | undefined {
  return useMcpStudioStore((s) => s.connections.find((c) => c.id === s.activeConnectionId))
}

export function useActiveRuntime(): ConnectionRuntime | undefined {
  return useMcpStudioStore((s) => (s.activeConnectionId ? s.runtimes[s.activeConnectionId] : undefined))
}
