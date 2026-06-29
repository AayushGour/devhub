import { GitBranch, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RepoMeta } from '../types'

interface Props {
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

export default function RepoHeader({ meta, fetching, onRefetch }: Props) {
  return (
    <div className="flex items-center px-4 py-2 border-b border-border shrink-0 bg-surface gap-3 min-w-0">
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
  )
}
