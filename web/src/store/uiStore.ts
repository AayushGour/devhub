import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  commandPaletteOpen: boolean
  recentTools: string[]
  favorites: string[]
  setCommandPaletteOpen: (open: boolean) => void
  addRecentTool: (toolId: string) => void
  toggleFavorite: (toolId: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      commandPaletteOpen: false,
      recentTools: [],
      favorites: [],
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      addRecentTool: (toolId) => {
        const recent = [toolId, ...get().recentTools.filter((id) => id !== toolId)].slice(0, 10)
        set({ recentTools: recent })
      },
      toggleFavorite: (toolId) => {
        const favs = get().favorites
        set({
          favorites: favs.includes(toolId)
            ? favs.filter((id) => id !== toolId)
            : [...favs, toolId],
        })
      },
    }),
    { name: 'devhub-ui' }
  )
)
