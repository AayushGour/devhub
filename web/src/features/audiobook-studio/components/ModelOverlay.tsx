import { useEffect, useState } from 'react'
import { onModelStatus } from '../utils/conversionEngine'

/**
 * Model download progress. Subscribes to the engine rather than taking props,
 * because the download is triggered from several places — a voice preview, a
 * new conversion, resuming an interrupted one.
 */
export default function ModelOverlay() {
  const [status, setStatus] = useState<{ label: string; progress?: number } | null>(null)

  useEffect(() => {
    return onModelStatus((label, progress) => {
      // 'ready' closes the overlay. Otherwise only the download is worth showing:
      // once the model is resident later loads are instant and would just flash.
      if (label === 'ready') {
        setStatus(null)
        return
      }
      setStatus(
        progress === undefined && !label.startsWith('downloading') ? null : { label, progress },
      )
    })
  }, [])

  // The download finishing is not the end of the wait: building the inference
  // session takes seconds more. Saying "downloading 100%" through that reads as
  // a stall, so the label changes and the overlay stays until narration starts.
  const preparing = (status?.progress ?? 0) >= 1

  if (!status) return null

  const percent = Math.round((status.progress ?? 0) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface border border-border rounded-xl p-8 w-[22rem] flex flex-col gap-3 text-center">
        <p className="text-sm text-on-surface font-medium">Preparing the narrator</p>
        <p className="text-xs text-on-surface-muted truncate">
          {preparing ? 'starting the voice model…' : status.label}
        </p>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
          <div
            className={
              preparing
                ? 'h-full bg-accent animate-pulse'
                : 'h-full bg-accent transition-[width] duration-200'
            }
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-on-surface-muted tabular-nums">
          {preparing ? 'this takes a moment the first time' : `${percent}%`}
        </p>
      </div>
    </div>
  )
}
