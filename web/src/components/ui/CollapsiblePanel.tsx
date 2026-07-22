import type { ReactNode, CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import './CollapsiblePanel.css'

interface CollapsiblePanelProps {
  collapsed: boolean
  onToggle: () => void
  /** Expanded width — any CSS length/percentage. Also the target of the keyframes. */
  width?: string
  /** Draw the divider border on the inner container. Off when the child owns its own border. */
  bordered?: boolean
  labelExpand?: string
  labelCollapse?: string
  className?: string
  children: ReactNode
}

/**
 * A left-side pane that collapses to zero width with a keyframe animation and
 * exposes an edge toggle button anchored to its right (the pane↔content seam).
 * The pane stays mounted while collapsed so both directions animate.
 */
export default function CollapsiblePanel({
  collapsed,
  onToggle,
  width = '50%',
  bordered = true,
  labelExpand = 'Show panel',
  labelCollapse = 'Hide panel',
  className,
  children,
}: CollapsiblePanelProps) {
  const [anim, setAnim] = useState<'collapse' | 'expand' | null>(null)
  const prevCollapsed = useRef(collapsed)

  // Trigger the keyframe on state change only (not on mount). useLayoutEffect
  // sets the anim class before paint so the width change never jumps.
  useLayoutEffect(() => {
    if (prevCollapsed.current !== collapsed) {
      setAnim(collapsed ? 'collapse' : 'expand')
      prevCollapsed.current = collapsed
    }
  }, [collapsed])

  return (
    <div
      className={cn(
        'collapsible-panel',
        collapsed && 'collapsible-panel--collapsed',
        anim === 'collapse' && 'collapsible-panel--anim-collapse',
        anim === 'expand' && 'collapsible-panel--anim-expand',
      )}
      style={{ '--panel-w': width } as CSSProperties}
      // Guard against bubbled child animations (e.g. Monaco cursor blink)
      onAnimationEnd={e => e.target === e.currentTarget && setAnim(null)}
    >
      <div
        className={cn(
          'h-full w-full overflow-hidden flex flex-col',
          bordered && 'border-r border-border',
          bordered && collapsed && 'border-r-0',
          className,
        )}
      >
        {children}
      </div>

      <Tooltip content={collapsed ? labelExpand : labelCollapse}>
        <button
          onClick={onToggle}
          aria-label={collapsed ? labelExpand : labelCollapse}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex items-center justify-center w-5 h-10 rounded-full bg-surface border border-border text-on-surface-muted cursor-pointer hover:text-on-surface hover:border-on-surface-muted transition-colors duration-150"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </Tooltip>
    </div>
  )
}
