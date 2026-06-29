import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@/types'
import { DEFAULT_MODEL_ID, getModelById } from '@/lib/llm/models'
import { resetEngine, getEngine } from '@/lib/llm/engine'
import { useIndexingStore } from './indexingStore'

interface SettingsState {
  theme: Theme
  sidebarCollapsed: boolean
  contextAwareExpansion: boolean
  ragLlmModel: string
  setTheme: (theme: Theme) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setContextAwareExpansion: (enabled: boolean) => void
  setRagLlmModel: (modelId: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      contextAwareExpansion: false,
      ragLlmModel: DEFAULT_MODEL_ID,
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setContextAwareExpansion: (enabled) => set({ contextAwareExpansion: enabled }),
      setRagLlmModel: (modelId) => {
        resetEngine()
        set({ ragLlmModel: modelId })
        const modelEntry = getModelById(modelId)
        const { start, setProgress, finish, setError } = useIndexingStore.getState()
        start(`Loading ${modelEntry?.label ?? modelId}`, () => {})
        getEngine(modelId, (pct) => setProgress(pct, 100))
          .then(() => finish())
          .catch(() => setError('Model download failed'))
      },
    }),
    {
      name: 'devhub-settings',
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>
        if (version < 1) {
          state.ragLlmModel = state.ragLlmModel ?? DEFAULT_MODEL_ID
        }
        return state
      },
    }
  )
)

// Apply saved theme on module load
document.documentElement.setAttribute(
  'data-theme',
  useSettingsStore.getState().theme
)
