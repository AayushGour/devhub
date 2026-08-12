import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useActiveRuntime } from '../store/mcpStudioStore'
import type { CapabilityKind, DiscoveryState } from '../types'
import ToolsPanel from './ToolsPanel'
import PromptsPanel from './PromptsPanel'
import ResourcesPanel from './ResourcesPanel'
import TemplatesPanel from './TemplatesPanel'
import ServerIdentityBar from './ServerIdentityBar'

const TABS: { kind: CapabilityKind; label: string }[] = [
  { kind: 'tools', label: 'Tools' },
  { kind: 'prompts', label: 'Prompts' },
  { kind: 'resources', label: 'Resources' },
  { kind: 'templates', label: 'Templates' },
]

const TAB_BTN_CLS =
  'flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 border-transparent transition-colors duration-150'

function TabCount({ discovery }: { discovery: DiscoveryState<unknown> }) {
  if (discovery.status === 'loading') return <span className="opacity-60">…</span>
  if (discovery.status === 'error') return <span className="text-red-400">!</span>
  return <span className="text-on-surface-muted/70">{discovery.items.length}</span>
}

export default function CapabilityTabs() {
  const runtime = useActiveRuntime()
  const [active, setActive] = useState<CapabilityKind>('tools')

  if (!runtime || runtime.status !== 'connected') return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border shrink-0 relative">
        <div className="flex items-center">
        {TABS.map((t) => {
          const discovery = runtime[t.kind]
          const disabled = discovery.status === 'unsupported'
          return (
            <button
              key={t.kind}
              disabled={disabled}
              onClick={() => setActive(t.kind)}
              className={cn(
                TAB_BTN_CLS,
                disabled
                  ? 'opacity-40 cursor-not-allowed text-on-surface-muted'
                  : active === t.kind
                    ? 'border-b-accent text-on-surface font-medium'
                    : 'text-on-surface-muted hover:text-on-surface cursor-pointer',
              )}
            >
              {t.label}
              {!disabled && <TabCount discovery={discovery} />}
            </button>
          )
        })}
        </div>
        <ServerIdentityBar />
      </div>

      <div className="flex-1 min-h-0">
        {active === 'tools' && <ToolsPanel />}
        {active === 'prompts' && <PromptsPanel />}
        {active === 'resources' && <ResourcesPanel />}
        {active === 'templates' && <TemplatesPanel />}
      </div>
    </div>
  )
}
