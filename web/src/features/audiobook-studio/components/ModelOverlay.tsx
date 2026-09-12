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
      // Only the download phase is worth an overlay; once the model is resident,
      // subsequent loads are instant and would just flash the screen.
      setStatus(progress === undefined && !label.startsWith('downloading') ? null : { label, progress })
    })
  }, [])

  useEffect(() => {
    if (!status || (status.progress ?? 0) < 1) return
    const timer = setTimeout(() => setStatus(null), 600)
    return () => clearTimeout(timer)
  }, [status])

  if (!status) return null

  const percent = Math.round((status.progress ?? 0) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface border border-border rounded-xl p-8 w-[22rem] flex flex-col gap-3 text-center">
        <p className="text-sm text-on-surface font-medium">Preparing the narrator</p>
        <p className="text-xs text-on-surface-muted truncate">{status.label}</p>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-on-surface-muted tabular-nums">{percent}%</p>
      </div>
    </div>
  )
}
