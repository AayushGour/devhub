import * as Dialog from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandPaletteOpen])

  return (
    <Dialog.Root open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface-raised border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search size={16} className="text-on-surface-muted shrink-0" />
            <input
              autoFocus
              placeholder="Search tools, commands..."
              className="flex-1 bg-transparent text-on-surface text-sm outline-none placeholder:text-on-surface-muted"
            />
            <kbd className="text-xs text-on-surface-muted border border-border rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>
          <div className="p-2">
            <p className="text-xs text-on-surface-muted px-3 py-2">
              No commands yet — tools coming in Phase 1.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
