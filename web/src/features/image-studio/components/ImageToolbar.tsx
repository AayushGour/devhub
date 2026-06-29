import { Download, Trash2, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BTN = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-medium transition-colors duration-150'

interface Props {
  doneCount: number
  totalCount: number
  onConvertAll: () => void
  onDownloadZip: () => void
  onClear: () => void
}

export default function ImageToolbar({ doneCount, totalCount, onConvertAll, onDownloadZip, onClear }: Props) {
  return (
    <div className="shrink-0 h-11 flex items-center gap-2 px-3 border-b border-border bg-surface">
      <span className="text-[0.81rem] font-semibold text-on-surface mr-1">Image Studio</span>

      {totalCount > 0 && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-[0.75rem] text-on-surface-muted">
            {doneCount}/{totalCount} converted
          </span>
        </>
      )}

      <div className="flex-1" />

      {totalCount > 0 && (
        <>
          <button
            onClick={onConvertAll}
            className={cn(BTN, 'bg-accent text-accent-text hover:bg-accent-hover')}
          >
            <Wand2 size={12} />
            Convert All
          </button>

          <button
            onClick={onDownloadZip}
            disabled={doneCount === 0}
            className={cn(
              BTN,
              'border border-border',
              doneCount > 0
                ? 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
                : 'opacity-40 cursor-not-allowed'
            )}
          >
            <Download size={12} />
            Download ZIP
          </button>

          <button
            onClick={onClear}
            className={cn(BTN, 'border border-border text-on-surface-muted hover:text-red-500 hover:bg-red-50 hover:border-red-200')}
          >
            <Trash2 size={12} />
            Clear
          </button>
        </>
      )}
    </div>
  )
}
