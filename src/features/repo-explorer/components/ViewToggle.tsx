import { GitGraph, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExplorerView } from '../types'

interface Props {
  view: ExplorerView
  onChange: (view: ExplorerView) => void
  repoLabel: string
}

const BTN = 'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors duration-150'

export default function ViewToggle({ view, onChange, repoLabel }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-surface">
      <span className="text-xs font-mono text-on-surface-muted">{repoLabel}</span>
      <div className="flex gap-1 bg-surface-raised rounded-lg p-0.5 border border-border">
        <button
          onClick={() => onChange('graph')}
          className={cn(BTN, view === 'graph'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface')}
        >
          <GitGraph size={12} />
          Graph
        </button>
        <button
          onClick={() => onChange('wiki')}
          className={cn(BTN, view === 'wiki'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface')}
        >
          <BookOpen size={12} />
          Wiki
        </button>
      </div>
    </div>
  )
}
