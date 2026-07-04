import * as ContextMenu from '@radix-ui/react-context-menu'
import type { HistoryEntry } from '../PreviewHost'

const ITEM_CLS =
  'flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-sm text-on-surface outline-none cursor-pointer hover:bg-surface-hover focus:bg-surface-hover'

/**
 * Right-click history list content for a Back/Forward button — the entries
 * reachable in that direction from `historyIndex`, nearest-to-current first.
 */
export default function HistoryMenuItems({
  history,
  historyIndex,
  direction,
  onJump,
}: {
  history: HistoryEntry[]
  historyIndex: number
  direction: 'back' | 'forward'
  onJump: (index: number) => void
}) {
  const entries =
    direction === 'back'
      ? history
          .slice(0, historyIndex)
          .map((entry, index) => ({ entry, index }))
          .reverse()
      : history.slice(historyIndex + 1).map((entry, index) => ({ entry, index: historyIndex + 1 + index }))

  return (
    <ContextMenu.Content className="min-w-[200px] max-w-[320px] bg-surface-raised border border-border rounded-lg shadow-xl py-1 z-50">
      {entries.map(({ entry, index }) => (
        <ContextMenu.Item key={index} className={ITEM_CLS} onSelect={() => onJump(index)}>
          <span className="truncate">{entry.fileName}</span>
          <span className="truncate text-xs text-on-surface-muted">{entry.relativePath}</span>
        </ContextMenu.Item>
      ))}
    </ContextMenu.Content>
  )
}
