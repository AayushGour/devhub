import { CheckCircle, XCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { type DocEntry } from '../hooks/useRagEngine'

interface Props {
  docs: DocEntry[]
  onRemove: (name: string) => void
}

export default function DocList({ docs, onRemove }: Props) {
  if (docs.length === 0) {
    return (
      <p className="text-xs text-on-surface-muted text-center py-4 px-2">
        No documents yet. Drop files above.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {docs.map((doc) => (
        <li
          key={doc.name}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-raised text-xs group"
        >
          {doc.status === 'processing' && (
            <Loader2 size={12} className="shrink-0 text-accent animate-spin" />
          )}
          {doc.status === 'done' && (
            <CheckCircle size={12} className="shrink-0 text-green-500" />
          )}
          {doc.status === 'error' && (
            <XCircle size={12} className="shrink-0 text-red-500" />
          )}
          <Tooltip content={doc.status === 'processing' ? doc.statusText : doc.name}>
            <span
              className={cn(
                'flex-1 truncate',
                doc.status === 'error' ? 'text-red-400' : 'text-on-surface-muted',
              )}
            >
              {doc.status === 'processing' ? doc.statusText : doc.name}
            </span>
          </Tooltip>
          {doc.status !== 'processing' && (
            <Tooltip content={`Remove ${doc.name}`}>
              <button
                onClick={() => onRemove(doc.name)}
                aria-label={`Remove ${doc.name}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-muted hover:text-on-surface cursor-pointer"
              >
                <X size={11} />
              </button>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  )
}
