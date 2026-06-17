import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@/types'

interface SettingsState {
  theme: Theme
  sidebarCollapsed: boolean
  contextAwareExpansion: boolean
  setTheme: (theme: Theme) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setContextAwareExpansion: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      contextAwareExpansion: false,
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setContextAwareExpansion: (enabled) => set({ contextAwareExpansion: enabled }),
    }),
    { name: 'devhub-settings' }
  )
)

// Apply saved theme on module load
document.documentElement.setAttribute(
  'data-theme',
  useSettingsStore.getState().theme
)
