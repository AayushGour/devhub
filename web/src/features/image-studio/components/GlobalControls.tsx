import { Link2, Link2Off } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { OUTPUT_FORMAT_LIST, OUTPUT_FORMATS } from '../utils/formatInfo'
import type { GlobalSettings } from '../hooks/useImageStudio'

const SELECT_CLS = 'bg-surface-raised border border-border rounded-lg px-2 py-1 text-[0.75rem] text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const INPUT_CLS = 'w-[5rem] bg-surface-raised border border-border rounded-lg px-2 py-1 text-[0.75rem] text-on-surface outline-none focus:border-accent transition-colors duration-150 font-mono'
const LABEL_CLS = 'text-[0.69rem] font-semibold uppercase tracking-wide text-on-surface-muted'

interface Props {
  settings: GlobalSettings
  onChange: (s: GlobalSettings) => void
  onApplyAll: () => void
}

export default function GlobalControls({ settings, onChange, onApplyAll }: Props) {
  const isQualityCapable = OUTPUT_FORMATS[settings.format].qualityCapable

  return (
    <div className="shrink-0 border-b border-border px-4 py-3 flex flex-col gap-3">
      {/* Row 1: format + quality */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={LABEL_CLS}>Output</span>
          <select
            value={settings.format}
            onChange={e => onChange({ ...settings, format: e.target.value as GlobalSettings['format'] })}
            className={SELECT_CLS}
          >
            {OUTPUT_FORMAT_LIST.map(f => (
              <option key={f} value={f}>{OUTPUT_FORMATS[f].label}</option>
            ))}
          </select>
        </div>

        {isQualityCapable && (
          <div className="flex items-center gap-2 flex-1">
            <span className={LABEL_CLS}>Quality</span>
            <input
              type="range"
              min={1}
              max={100}
              value={settings.quality}
              onChange={e => onChange({ ...settings, quality: parseInt(e.target.value) })}
              className="flex-1 accent-accent cursor-pointer"
            />
            <span className="text-[0.75rem] tabular-nums text-on-surface w-7 text-right">{settings.quality}</span>
          </div>
        )}
      </div>

      {/* Row 2: resize */}
      <div className="flex items-center gap-3">
        <span className={LABEL_CLS}>Resize</span>
        <input
          type="number"
          placeholder="W"
          min={1}
          value={settings.resize.width}
          onChange={e => onChange({ ...settings, resize: { ...settings.resize, width: e.target.value } })}
          className={INPUT_CLS}
        />
        <span className="text-[0.75rem] text-on-surface-muted">×</span>
        <input
          type="number"
          placeholder="H"
          min={1}
          value={settings.resize.height}
          onChange={e => onChange({ ...settings, resize: { ...settings.resize, height: e.target.value } })}
          className={INPUT_CLS}
        />
        <Tooltip content={settings.resize.maintainAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}>
          <button
            onClick={() => onChange({ ...settings, resize: { ...settings.resize, maintainAspectRatio: !settings.resize.maintainAspectRatio } })}
            aria-label={settings.resize.maintainAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
            className={cn(
              'p-1 rounded-md border transition-colors duration-150',
              settings.resize.maintainAspectRatio
                ? 'border-accent text-accent bg-accent/10'
                : 'border-border text-on-surface-muted hover:border-accent/50'
            )}
          >
            {settings.resize.maintainAspectRatio ? <Link2 size={12} /> : <Link2Off size={12} />}
          </button>
        </Tooltip>

        <div className="flex-1" />

        <button
          onClick={onApplyAll}
          className="text-[0.69rem] font-medium text-accent hover:text-accent-hover transition-colors duration-150"
        >
          Apply to all →
        </button>
      </div>
    </div>
  )
}
