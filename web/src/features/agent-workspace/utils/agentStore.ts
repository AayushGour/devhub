import { create } from 'zustand'

export type StepType = 'think' | 'call' | 'observe' | 'done' | 'error' | 'compact'

export interface AgentStep {
  id: string
  type: StepType
  content: string
  toolName?: string
  args?: Record<string, unknown>
  timestamp: number
}

export interface AgentSession {
  id: string
  task: string
  modelId: string
  status: 'running' | 'done' | 'error' | 'stopped'
  steps: AgentStep[]
  enabledTools: string[]
  createdAt: number
}

interface AgentStoreState {
  sessions: AgentSession[]
  activeSessionId: string | null
  createSession: (task: string, modelId: string, enabledTools: string[]) => string
  appendStep: (sessionId: string, step: AgentStep) => void
  setStatus: (sessionId: string, status: AgentSession['status']) => void
  setActiveSession: (id: string | null) => void
  deleteSession: (id: string) => void
  clearHistory: () => void
}

const MAX_SESSIONS = 20

export const useAgentStore = create<AgentStoreState>()((set) => ({
  sessions: [],
  activeSessionId: null,

  createSession: (task, modelId, enabledTools) => {
    const id = crypto.randomUUID()
    set((s) => ({
      activeSessionId: id,
      sessions: [
        { id, task, modelId, status: 'running' as const, steps: [], enabledTools, createdAt: Date.now() },
        ...s.sessions,
      ].slice(0, MAX_SESSIONS),
    }))
    return id
  },

  appendStep: (sessionId, step) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, steps: [...sess.steps, step] }
          : sess,
      ),
    })),

  setStatus: (sessionId, status) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, status } : sess,
      ),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  deleteSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      // Drop the selection if the removed session was the active one, so the
      // inspector falls back to its empty state rather than a dangling id.
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),

  clearHistory: () => set({ sessions: [], activeSessionId: null }),
}))
