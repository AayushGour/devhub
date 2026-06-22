import { GitGraph, BookOpen, GitBranch, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExplorerView } from '../types'
import type { RepoMeta } from '../types'

interface Props {
  view: ExplorerView
  onChange: (view: ExplorerView) => void
  meta: RepoMeta
  fetching: boolean
  onRefetch: () => void
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const BTN = 'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors duration-150'

export default function ViewToggle({ view, onChange, meta, fetching, onRefetch }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-surface gap-4">
      {/* Left: repo identity + index info */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-on-surface truncate shrink-0">
          {meta.owner}/{meta.repo}
        </span>
        <span className="text-on-surface-muted/40 text-xs select-none">·</span>
        <span className="flex items-center gap-1 text-[0.65rem] text-on-surface-muted shrink-0">
          <GitBranch size={10} />
          {meta.defaultBranch}
        </span>
        <span className="text-on-surface-muted/40 text-xs select-none">·</span>
        <span className="flex items-center gap-1 text-[0.65rem] text-on-surface-muted shrink-0">
          <Clock size={10} />
          indexed {timeAgo(meta.fetchedAt)}
        </span>
        <button
          onClick={onRefetch}
          disabled={fetching}
          title="Refetch and reindex"
          className={cn(
            'flex items-center gap-1 text-[0.65rem] px-1.5 py-0.5 rounded border transition-colors duration-150',
            fetching
              ? 'border-border text-on-surface-muted/40 cursor-not-allowed'
              : 'border-border text-on-surface-muted hover:text-accent hover:border-accent',
          )}
        >
          <RefreshCw size={10} className={cn(fetching && 'animate-spin')} />
          Refetch
        </button>
      </div>

      {/* Right: view toggle */}
      <div className="flex gap-1 bg-surface-raised rounded-lg p-0.5 border border-border shrink-0">
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
