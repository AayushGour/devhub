import { Tooltip } from '@/components/ui/Tooltip'
import { Info, Loader2, SlidersHorizontal } from 'lucide-react'
import type { EnginePreset, TraceParams } from '../engines/types'

interface Props {
  preset: EnginePreset
  params: TraceParams
  refining: boolean
  onChange: (knobId: string, value: number) => void
}

export default function RefinePanel({ preset, params, refining, onChange }: Props) {
  return (
    <div className="shrink-0 w-60 border-l border-border bg-surface-raised flex flex-col">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border shrink-0">
        <SlidersHorizontal size={13} className="text-on-surface-muted" />
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
          Refine
        </span>
        {refining && <Loader2 size={12} className="text-accent animate-spin ml-auto" />}
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-5">
        {preset.knobs.length === 0 ? (
          <p className="text-[0.75rem] text-on-surface-muted">
            {preset.label} has no adjustable parameters.
          </p>
        ) : (
          preset.knobs.map(knob => {
            const value = Number(params[knob.id] ?? knob.min)
            return (
              <label key={knob.id} className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-[0.75rem]">
                  <span className="flex items-center gap-1 text-on-surface">
                    {knob.label}
                    {knob.tooltip && (
                      <Tooltip content={knob.tooltip} side="left" sideOffset={8}>
                        <button
                          type="button"
                          className="flex items-center text-on-surface-muted hover:text-on-surface transition-colors duration-150 cursor-default outline-none"
                          tabIndex={-1}
                        >
                          <Info size={11} />
                        </button>
                      </Tooltip>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-on-surface-muted">{value}</span>
                </span>
                <input
                  type="range"
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  value={value}
                  onChange={e => onChange(knob.id, Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
