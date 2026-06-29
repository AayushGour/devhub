import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OUTPUT_FORMATS } from '../utils/formatInfo'
import type { ImageItem } from '../hooks/useImageStudio'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

interface Props {
  item: ImageItem | null
  viewMode: 'before' | 'after'
  onViewModeChange: (mode: 'before' | 'after') => void
}

export default function PreviewPanel({ item, viewMode, onViewModeChange }: Props) {
  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-on-surface-muted">
        <ImageIcon size={36} strokeWidth={1.2} />
        <span className="text-[0.81rem]">Select an image to preview</span>
      </div>
    )
  }

  const showAfter = viewMode === 'after'
  const src = showAfter ? (item.outputUrl ?? null) : item.originalUrl
  const size = showAfter ? item.outputSize : item.originalSize
  const label = showAfter
    ? OUTPUT_FORMATS[item.outputFormat].label
    : item.file.type.split('/')[1]?.toUpperCase() ?? 'Original'

  const noOutput = showAfter && !item.outputUrl

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toggle */}
      <div className="shrink-0 flex items-center justify-center gap-1 pt-4 pb-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-[0.75rem] font-medium">
          <button
            onClick={() => onViewModeChange('before')}
            className={cn(
              'px-3 py-1 transition-colors duration-150',
              viewMode === 'before'
                ? 'bg-surface-raised text-on-surface'
                : 'text-on-surface-muted hover:text-on-surface'
            )}
          >
            Before
          </button>
          <button
            onClick={() => onViewModeChange('after')}
            className={cn(
              'px-3 py-1 border-l border-border transition-colors duration-150',
              viewMode === 'after'
                ? 'bg-surface-raised text-on-surface'
                : 'text-on-surface-muted hover:text-on-surface'
            )}
          >
            After
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center px-6 min-h-0 overflow-hidden">
        {noOutput ? (
          <div className="flex flex-col items-center gap-3 text-on-surface-muted">
            <ImageIcon size={32} strokeWidth={1.2} />
            <span className="text-[0.81rem]">
              {item.status === 'converting' ? 'Converting…' : 'Not converted yet'}
            </span>
          </div>
        ) : (
          <img
            src={src ?? ''}
            alt="preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
          />
        )}
      </div>

      {/* Meta */}
      <div className="shrink-0 flex items-center justify-center gap-3 py-3 text-[0.75rem] text-on-surface-muted">
        {size !== null && (
          <span className="font-medium text-on-surface">{formatBytes(size)}</span>
        )}
        {size !== null && <span>·</span>}
        <span>{label}</span>
        {showAfter && item.outputSize !== null && item.outputSize < item.originalSize && (
          <>
            <span>·</span>
            <span className="text-emerald-500 font-medium">
              −{Math.round((1 - item.outputSize / item.originalSize) * 100)}% saved
            </span>
          </>
        )}
      </div>
    </div>
  )
}
