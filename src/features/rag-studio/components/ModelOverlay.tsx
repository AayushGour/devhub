import { type OverlayState } from '../hooks/useRagEngine'

interface Props {
  state: OverlayState
  onDismiss?: () => void
}

export default function ModelOverlay({ state, onDismiss }: Props) {
  if (!state.open) return null

  if (state.error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-surface border border-border rounded-xl p-8 w-96 flex flex-col gap-3 text-center">
          <p className="text-sm font-semibold text-red-400">Model Load Failed</p>
          <p className="text-xs text-on-surface-muted leading-relaxed">{state.label}</p>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="mt-2 px-4 py-1.5 text-xs rounded-lg bg-surface-raised border border-border text-on-surface hover:bg-surface-hover transition-colors duration-150"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface border border-border rounded-xl p-8 w-80 flex flex-col gap-3 text-center">
        <p className="text-sm text-on-surface font-medium">{state.label}</p>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out rounded-full"
            style={{ width: `${state.pct}%` }}
          />
        </div>
        <p className="text-xs text-on-surface-muted">
          {state.pct}%{state.detail ? ` — ${state.detail}` : ''}
        </p>
        <p className="text-xs text-on-surface-muted mt-1">
          Models are cached after first download.
        </p>
      </div>
    </div>
  )
}
