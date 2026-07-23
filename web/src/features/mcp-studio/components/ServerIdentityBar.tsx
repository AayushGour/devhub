// Compact one-line server identity for the CapabilityTabs header: name/version +
// protocol pill + (when the server sent `instructions`) an Info button that opens
// the instructions as an overlay POPOVER — not an inline block — so toggling it
// never reflows/shrinks the tab content or Result area below.

import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveConnection, useActiveRuntime } from '../store/mcpStudioStore'

const BADGE_CLS =
  'text-[0.65rem] font-medium text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5'

export default function ServerIdentityBar() {
  const connection = useActiveConnection()
  const runtime = useActiveRuntime()
  const [instrOpen, setInstrOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close the instructions popover on Escape or outside-click; return focus to trigger.
  useEffect(() => {
    if (!instrOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setInstrOpen(false)
        triggerRef.current?.focus()
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node
      if (!popoverRef.current?.contains(t) && !triggerRef.current?.contains(t)) {
        setInstrOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [instrOpen])

  if (!connection || runtime?.status !== 'connected' || !runtime.initResult) return null

  const { serverInfo, protocolVersion, instructions } = runtime.initResult

  return (
    <div className="flex items-center gap-2 pr-2 min-w-0">
      <span className="text-xs font-medium text-on-surface truncate">
        {serverInfo?.name ?? connection.label}
      </span>
      {serverInfo?.version && (
        <span className="text-[0.65rem] text-on-surface-muted shrink-0">v{serverInfo.version}</span>
      )}
      {protocolVersion && <span className={cn(BADGE_CLS, 'shrink-0')}>protocol {protocolVersion}</span>}

      {instructions && (
        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            onClick={() => setInstrOpen((o) => !o)}
            aria-expanded={instrOpen}
            aria-controls="mcp-server-instructions"
            aria-label="Server instructions"
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-md border border-border transition-colors duration-150',
              instrOpen ? 'text-on-surface bg-surface-raised' : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover',
            )}
          >
            <Info size={13} />
          </button>
          {instrOpen && (
            <div
              ref={popoverRef}
              id="mcp-server-instructions"
              role="dialog"
              aria-label="Server instructions"
              className="absolute top-full right-0 mt-2 z-20 w-[28rem] max-w-[80vw] max-h-[60vh] overflow-y-auto border border-border rounded-lg bg-surface-raised p-3 shadow-lg"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-on-surface-muted mb-1.5">
                Instructions
              </p>
              <p className="text-xs text-on-surface-muted whitespace-pre-wrap">{instructions}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
