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
        { id, task, modelId, status: 'running', steps: [], enabledTools, createdAt: Date.now() },
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

  clearHistory: () => set({ sessions: [], activeSessionId: null }),
}))
