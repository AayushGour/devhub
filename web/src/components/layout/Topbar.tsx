import { Search } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import type { Theme } from '@/types'

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'github', label: 'GitHub' },
  { value: 'nord', label: 'Nord' },
  { value: 'dracula', label: 'Dracula' },
]

export default function Topbar() {
  const { theme, setTheme } = useSettingsStore()
  const { setCommandPaletteOpen } = useUIStore()

  return (
    <header className="h-11 flex items-center px-5 gap-3 shrink-0 bg-surface border-b border-border">
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="topbar-search flex items-center gap-2 w-[16.25rem] px-[0.88rem] py-1.5 rounded-full border border-border bg-surface-raised text-on-surface-muted text-[0.81rem] tracking-[-0.01rem] cursor-text shrink-0 text-left hover:border-accent transition-colors duration-150"
      >
        <Search size={13} className="shrink-0" />
        <span className="flex-1">Search</span>
        <kbd className="text-[0.69rem] text-on-surface-muted border border-border rounded-[0.31rem] px-[0.31rem] py-px bg-surface tracking-normal">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <select
        value={theme}
        onChange={e => setTheme(e.target.value as Theme)}
        className="text-xs font-normal tracking-[-0.01rem] bg-surface-raised text-on-surface border border-border rounded-full px-[0.62rem] py-1 cursor-pointer outline-none font-[inherit]"
      >
        {themes.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

    </header>
  )
}
