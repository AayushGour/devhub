import { Play, Download, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OUTPUT_FORMAT_LIST, OUTPUT_FORMATS } from '../utils/formatInfo'
import type { ImageItem } from '../hooks/useImageStudio'

const SELECT_CLS = 'bg-surface-raised border border-border rounded-md px-1.5 py-0.5 text-[0.69rem] text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const BTN = 'flex items-center justify-center w-6 h-6 rounded-md transition-colors duration-150'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

interface Props {
  item: ImageItem
  isSelected: boolean
  onSelect: () => void
  onConvert: () => void
  onDownload: () => void
  onRemove: () => void
  onFormatChange: (format: ImageItem['outputFormat']) => void
  onQualityChange: (quality: number) => void
}

export default function ImageQueueItem({
  item, isSelected, onSelect, onConvert, onDownload, onRemove, onFormatChange, onQualityChange
}: Props) {
  const isQualityCapable = OUTPUT_FORMATS[item.outputFormat].qualityCapable

  const sizeDelta = item.outputSize !== null
    ? item.outputSize < item.originalSize
      ? `−${Math.round((1 - item.outputSize / item.originalSize) * 100)}%`
      : `+${Math.round((item.outputSize / item.originalSize - 1) * 100)}%`
    : null

  const sizeColor = item.outputSize !== null
    ? item.outputSize < item.originalSize ? 'text-emerald-500' : 'text-amber-500'
    : ''

  return (
    <div
      onClick={onSelect}
      className={cn(
        'mx-3 mb-2 rounded-xl border p-2.5 cursor-pointer transition-[border-color,background-color] duration-150',
        isSelected
          ? 'border-accent bg-accent/5'
          : 'border-border hover:border-accent/40 bg-surface'
      )}
    >
      {/* Top row: thumbnail + name + remove */}
      <div className="flex items-center gap-2">
        <div className="shrink-0 w-9 h-9 rounded-md overflow-hidden bg-surface-raised border border-border">
          <img
            src={item.originalUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[0.75rem] font-medium text-on-surface truncate leading-tight">
            {item.file.name}
          </p>
          <p className="text-[0.69rem] text-on-surface-muted">
            {formatBytes(item.originalSize)}
            {item.outputSize !== null && (
              <>
                {' → '}
                <span className={sizeColor}>{formatBytes(item.outputSize)}</span>
                {sizeDelta && <span className={cn('ml-1', sizeColor)}>{sizeDelta}</span>}
              </>
            )}
          </p>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className={cn(BTN, 'text-on-surface-muted hover:text-red-500 hover:bg-red-50')}
        >
          <X size={12} />
        </button>
      </div>

      {/* Bottom row: format + quality + actions */}
      <div className="flex items-center gap-2 mt-2 pl-11" onClick={e => e.stopPropagation()}>
        <select
          value={item.outputFormat}
          onChange={e => onFormatChange(e.target.value as ImageItem['outputFormat'])}
          className={SELECT_CLS}
        >
          {OUTPUT_FORMAT_LIST.map(f => (
            <option key={f} value={f}>{OUTPUT_FORMATS[f].label}</option>
          ))}
        </select>

        {isQualityCapable && (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="range"
              min={1}
              max={100}
              value={item.quality}
              onChange={e => onQualityChange(parseInt(e.target.value))}
              className="flex-1 accent-accent cursor-pointer"
            />
            <span className="text-[0.63rem] tabular-nums text-on-surface-muted w-5 text-right">
              {item.quality}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Status + convert */}
        {item.status === 'converting' && (
          <Loader2 size={14} className="text-accent animate-spin" />
        )}
        {item.status === 'done' && (
          <CheckCircle size={14} className="text-emerald-500" />
        )}
        {item.status === 'error' && (
          <AlertCircle size={14} className="text-red-500" title={item.error ?? 'Error'} />
        )}

        {item.status !== 'converting' && (
          <button
            onClick={onConvert}
            title="Convert"
            className={cn(BTN, 'border border-border text-on-surface-muted hover:text-accent hover:border-accent')}
          >
            <Play size={11} fill="currentColor" />
          </button>
        )}

        {item.status === 'done' && (
          <button
            onClick={onDownload}
            title="Download"
            className={cn(BTN, 'border border-border text-on-surface-muted hover:text-accent hover:border-accent')}
          >
            <Download size={11} />
          </button>
        )}
      </div>

      {item.status === 'error' && item.error && (
        <p className="mt-1.5 pl-11 text-[0.63rem] text-red-500 truncate" title={item.error}>
          {item.error}
        </p>
      )}
    </div>
  )
}
