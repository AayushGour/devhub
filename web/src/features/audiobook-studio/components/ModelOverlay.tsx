import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { onModelError, onModelStatus } from '../utils/conversionEngine'

/**
 * Model download progress. Subscribes to the engine rather than taking props,
 * because the download is triggered from several places — a voice preview, a
 * new conversion, resuming an interrupted one.
 */
export default function ModelOverlay() {
  const [status, setStatus] = useState<{ label: string; progress?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return onModelStatus((label, progress) => {
      // Any progress at all means a load is running again, so a failure from a
      // previous attempt is stale — the fallback to WASM reaches here.
      setError(null)
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

  useEffect(() => {
    // The load has stopped and will not resume on its own. Without this the
    // overlay sits on "downloading model…" forever, covering every control in
    // the studio — Stop included — with nothing left to produce the 'ready'
    // that would clear it.
    return onModelError((message) => {
      setStatus(null)
      setError(message)
    })
  }, [])

  // The download finishing is not the end of the wait: building the inference
  // session takes seconds more. Saying "downloading 100%" through that reads as
  // a stall, so the label changes and the overlay stays until narration starts.
  const preparing = (status?.progress ?? 0) >= 1

  if (!status && !error) return null

  const percent = Math.round((status?.progress ?? 0) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface border border-border rounded-xl p-8 w-[22rem] flex flex-col gap-3 text-center">
        {error ? (
          <>
            <p className="text-sm text-on-surface font-medium">The narrator could not be loaded</p>
            <p className="text-xs text-on-surface-muted break-words">{error}</p>
            <p className="text-xs text-on-surface-muted">
              Check your connection and try again — the download resumes from what was already
              fetched.
            </p>
            {/* The only way out of a failed load. Dismissing must genuinely
                clear the overlay, or a transient network error costs a reload
                — which just re-queues the conversion and brings it back. */}
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-1 self-center rounded-lg border border-border bg-surface-raised px-4 py-1.5 text-xs text-on-surface cursor-pointer transition-colors duration-150 hover:bg-surface-hover hover:border-accent"
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-on-surface font-medium">Preparing the narrator</p>
            <p className="text-xs text-on-surface-muted truncate">
              {preparing ? 'starting the voice model…' : status?.label}
            </p>
            <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full bg-accent',
                  preparing ? 'animate-pulse' : 'transition-[width] duration-200',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-muted tabular-nums">
              {preparing ? 'this takes a moment the first time' : `${percent}%`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
