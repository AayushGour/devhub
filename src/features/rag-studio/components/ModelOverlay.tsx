import { type OverlayState } from '../hooks/useRagEngine'

interface Props {
  state: OverlayState
}

export default function ModelOverlay({ state }: Props) {
  if (!state.open) return null

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
        <p className="text-xs text-on-surface-muted">
          Use a regular (non-incognito) window — incognito has a smaller storage
          quota and large models may fail to download.
        </p>
      </div>
    </div>
  )
}
