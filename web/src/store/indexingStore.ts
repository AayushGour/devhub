import { create } from 'zustand'

export type IndexingPhase =
  | 'idle'
  | 'fetching'
  | 'parsing'
  | 'embedding'
  | 'done'
  | 'error'

export interface IndexingState {
  phase: IndexingPhase
  label: string
  filesTotal: number
  filesDone: number
  pct: number
  cancelFn: (() => void) | null
  error: string | null
  // actions
  start: (label: string, cancelFn: () => void) => void
  setPhase: (phase: IndexingPhase, label: string) => void
  setProgress: (done: number, total: number) => void
  finish: () => void
  setError: (msg: string) => void
  cancel: () => void
  dismiss: () => void
}

export const useIndexingStore = create<IndexingState>()((set, get) => ({
  phase: 'idle',
  label: '',
  filesTotal: 0,
  filesDone: 0,
  pct: 0,
  cancelFn: null,
  error: null,

  start: (label, cancelFn) =>
    set({ phase: 'fetching', label, filesTotal: 0, filesDone: 0, pct: 0, cancelFn, error: null }),

  setPhase: (phase, label) => set({ phase, label }),

  setProgress: (done, total) =>
    set({ filesDone: done, filesTotal: total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }),

  finish: () => set({ phase: 'done', pct: 100, cancelFn: null }),

  setError: (msg) => set({ phase: 'error', error: msg, cancelFn: null }),

  cancel: () => {
    get().cancelFn?.()
    set({ phase: 'idle', label: '', pct: 0, cancelFn: null, error: null })
  },

  dismiss: () => set({ phase: 'idle', label: '', pct: 0, error: null }),
}))
