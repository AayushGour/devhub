import { useMemo } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { normalizeSvgForDisplay } from '../utils/postprocess'
import type { EnginePreset } from '../engines/types'
import type { TileState } from '../hooks/useSvgStudio'

interface Props {
  preset: EnginePreset
  state: TileState
  active: boolean
  onSelect: () => void
}

function formatBytes(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1 text-[0.69rem]">
      <span className="font-semibold tabular-nums text-on-surface">{value}</span>
      <span className="text-on-surface-muted">{label}</span>
    </span>
  )
}

const DOTTED = 'bg-[radial-gradient(circle,var(--border)_0.06rem,transparent_0.06rem)] bg-[length:1.25rem_1.25rem]'

export default function Tile({ preset, state, active, onSelect }: Props) {
  const done = state.status === 'done'
  const svg = state.status === 'done' ? state.svg : null
  const clean = useMemo(
    () => (svg ? DOMPurify.sanitize(normalizeSvgForDisplay(svg), { USE_PROFILES: { svg: true } }) : ''),
    [svg],
  )

  return (
    <button
      onClick={onSelect}
      disabled={!done}
      className={cn(
        'flex flex-col rounded-[1rem] border-2 overflow-hidden transition-all duration-150 text-left group',
        'disabled:cursor-default',
        active
          ? 'border-accent shadow-[0_0.25rem_1.5rem_rgba(0,0,0,0.12)]'
          : 'border-border enabled:hover:border-accent enabled:hover:shadow-[0_0.25rem_1.5rem_rgba(0,0,0,0.12)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-raised border-b border-border shrink-0">
        <span className="text-[0.69rem] font-bold tracking-[0.06em] uppercase text-accent">
          {preset.label}
        </span>
        <div className="flex-1" />
        {done && (
          <>
            <StatBadge label="paths" value={state.stats.paths} />
            <div className="w-px h-3 bg-border" />
            <StatBadge label="nodes" value={state.stats.nodes} />
            <div className="w-px h-3 bg-border" />
            <StatBadge label="size" value={formatBytes(state.stats.bytes)} />
          </>
        )}
      </div>

      {/* Preview */}
      <div className={cn('flex-1 flex items-center justify-center overflow-hidden relative min-h-[13.75rem]', DOTTED)}>
        {state.status === 'pending' && (
          <Loader2 size={22} className="text-accent animate-spin" />
        )}

        {state.status === 'failed' && (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <AlertCircle size={20} className="text-red-500" />
            <span className="text-[0.69rem] text-on-surface-muted">{state.error || 'Trace failed'}</span>
          </div>
        )}

        {done && (
          <>
            <div
              className="w-full p-6 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[11.25rem] [&>svg]:drop-shadow-md"
              dangerouslySetInnerHTML={{ __html: clean }}
            />
            <div className="absolute bottom-3 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <span className="bg-accent text-accent-text text-[0.69rem] font-semibold px-3 py-1.5 rounded-full shadow-lg">
                {active ? 'Selected' : 'Use this one'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-2 bg-surface border-t border-border shrink-0">
        <span className="text-[0.69rem] text-on-surface-muted">{preset.hint}</span>
      </div>
    </button>
  )
}
