import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIndexingStore } from '@/store/indexingStore'

export default function IndexingFooter() {
  const { phase, label, pct, filesDone, filesTotal, error, cancel, dismiss } = useIndexingStore()

  if (phase === 'idle') return null

  const isDone = phase === 'done'
  const isError = phase === 'error'

  return (
    <div className={cn(
      'h-8 shrink-0 flex items-center gap-3 px-4 border-t border-border text-xs',
      isDone ? 'bg-surface text-on-surface-muted' : 'bg-surface text-on-surface',
    )}>
      {isError ? (
        <AlertCircle size={12} className="text-red-400 shrink-0" />
      ) : isDone ? (
        <CheckCircle size={12} className="text-accent shrink-0" />
      ) : (
        <div className="w-24 h-1.5 bg-surface-raised rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <span className="flex-1 truncate">
        {isError
          ? error ?? 'Indexing failed'
          : isDone
            ? `${label} — complete`
            : filesTotal > 0
              ? `${label} · ${filesDone}/${filesTotal} files — ${pct}%`
              : label}
      </span>

      <button
        onClick={isDone || isError ? dismiss : cancel}
        className="text-on-surface-muted hover:text-on-surface transition-colors duration-150 shrink-0"
        aria-label={isDone || isError ? 'Dismiss' : 'Cancel indexing'}
      >
        <X size={12} />
      </button>
    </div>
  )
}
