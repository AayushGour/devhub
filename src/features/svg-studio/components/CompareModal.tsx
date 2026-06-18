import { svgStats, normalizeSvgForDisplay } from '../utils/converters'
import { cn } from '@/lib/utils'
import DOMPurify from 'dompurify'
import type { CompareOption } from '../hooks/useSvgStudio'

interface Props {
  a: CompareOption
  b: CompareOption
  onSelect: (method: 'A' | 'B') => void
}

function formatBytes(n: number) {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1 text-[11px]">
      <span className="font-semibold tabular-nums text-on-surface">{value}</span>
      <span className="text-on-surface-muted">{label}</span>
    </span>
  )
}

interface PanelProps {
  option: CompareOption
  sublabel: string
  onSelect: () => void
}

function PreviewPanel({ option, sublabel, onSelect }: PanelProps) {
  const stats = svgStats(option.svg)
  const clean = DOMPurify.sanitize(normalizeSvgForDisplay(option.svg), { USE_PROFILES: { svg: true } })

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex-1 flex flex-col rounded-[16px] border-2 overflow-hidden transition-all duration-150 text-left group',
        'border-border hover:border-accent hover:shadow-[0_4px_24px_rgba(0,0,0,0.12)]',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-raised border-b border-border shrink-0">
        <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-accent">
          {option.label}
        </span>
        <span className="text-[11px] text-on-surface-muted">{sublabel}</span>
        <div className="flex-1" />
        <StatBadge label="paths" value={stats.paths} />
        <div className="w-px h-3 bg-border" />
        <StatBadge label="size" value={formatBytes(stats.bytes)} />
      </div>

      {/* Preview */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          minHeight: 280,
        }}
      >
        <div
          className="w-full p-6 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[200px] [&>svg]:drop-shadow-md"
          dangerouslySetInnerHTML={{ __html: clean }}
        />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-accent/5">
          <span className="bg-accent text-accent-text text-[12px] font-semibold px-4 py-2 rounded-full shadow-lg">
            Use this one
          </span>
        </div>
      </div>
    </button>
  )
}

export default function CompareModal({ a, b, onSelect }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface rounded-[24px] border border-border shadow-[0_24px_64px_rgba(0,0,0,0.2)] w-full max-w-[860px] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-[15px] font-semibold text-on-surface">Choose vectorization style</h2>
          <p className="text-[12px] text-on-surface-muted mt-0.5">
            Click a result to use it — switch to embed mode any time from the toolbar
          </p>
        </div>

        <div className="flex gap-4 p-5">
          <PreviewPanel
            option={a}
            sublabel="32 colors · full detail"
            onSelect={() => onSelect('A')}
          />
          <PreviewPanel
            option={b}
            sublabel="4 colors · clean paths"
            onSelect={() => onSelect('B')}
          />
        </div>
      </div>
    </div>
  )
}
