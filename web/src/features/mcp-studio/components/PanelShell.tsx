// Shared layout for every capability panel (Tools / Prompts / Resources /
// Templates), so all four render an identical big split:
//
//   CollapsiblePanel[ selector list (capped, own scroll)
//                     + detail/arg-form (fills, own scroll)
//                     + sticky action footer ]      |      Result (full height + width)
//
// The left pane collapses to give the Result view ~100% width for reading large
// output — matching the diagram/markdown studios' editor|preview idiom. Each panel
// keeps its own state (selection, form values, result); PanelShell is pure layout.

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'

const SELECTOR_ROW_CLS =
  'block w-full text-left px-3 py-2 border-l-2 transition-colors duration-150 cursor-pointer'

/** One row in a capability selector list — unified across all four panels. */
export function SelectorRow({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        SELECTOR_ROW_CLS,
        selected ? 'border-l-accent bg-surface-raised' : 'border-l-transparent hover:bg-surface-hover',
      )}
    >
      <p className="text-xs font-medium text-on-surface truncate">{title}</p>
      {subtitle && <p className="text-[0.6rem] text-on-surface-muted line-clamp-2 mt-0.5">{subtitle}</p>}
    </button>
  )
}

interface PanelShellProps {
  /** Rendered selector rows (build with <SelectorRow/>). Capped height, own scroll. */
  list: ReactNode
  /** Selected-item detail + arg form. Fills remaining left-pane height, own scroll. */
  detail: ReactNode
  /** Sticky action footer (Run / Get / Read). Omit when nothing is selected. */
  footer?: ReactNode
  /** Result view — gets the full-height, full-remaining-width right pane. */
  result: ReactNode
  labelExpand: string
  labelCollapse: string
}

export default function PanelShell({ list, detail, footer, result, labelExpand, labelCollapse }: PanelShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-full min-h-0">
      <CollapsiblePanel
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        width="24rem"
        labelExpand={labelExpand}
        labelCollapse={labelCollapse}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 max-h-52 overflow-y-auto border-b border-border divide-y divide-border">
            {list}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">{detail}</div>
          {footer && (
            <div className="shrink-0 border-t border-border p-3 flex items-center gap-2">{footer}</div>
          )}
        </div>
      </CollapsiblePanel>

      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col p-4">{result}</div>
    </div>
  )
}
