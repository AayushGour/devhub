import { useState } from 'react'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'
import McpToolbar from './components/McpToolbar'
import ConnectionRail from './components/ConnectionRail'
import ConnectionForm from './components/ConnectionForm'
import ServerOverview from './components/ServerOverview'
import CapabilityTabs from './components/CapabilityTabs'
import { useActiveConnection, useActiveRuntime } from './store/mcpStudioStore'

export default function McpStudioPage() {
  const [showForm, setShowForm] = useState(false)
  const activeConnection = useActiveConnection()
  const runtime = useActiveRuntime()

  const showConnectionForm = showForm || !activeConnection

  // Rail is expanded by default; collapsing is a manual choice via the pane chevron.
  const [railCollapsed, setRailCollapsed] = useState(false)

  return (
    <div className="studio-root">
      <McpToolbar />
      <div className="flex flex-1 min-h-0">
        <CollapsiblePanel
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed((v) => !v)}
          width="15rem"
          labelExpand="Show connections"
          labelCollapse="Hide connections"
        >
          <ConnectionRail onNew={() => setShowForm(true)} />
        </CollapsiblePanel>
        <div className="flex-1 min-w-0 flex flex-col">
          {showConnectionForm ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ConnectionForm onConnected={() => setShowForm(false)} />
            </div>
          ) : (
            <>
              {runtime?.status !== 'connected' && (
                <div className="shrink-0 p-4 border-b border-border">
                  <ServerOverview />
                </div>
              )}
              <div className="flex-1 min-h-0">
                {/* Key by connection id so switching servers remounts the tabs and
                    all panel-local UI state (selected tab/tool/prompt, form values,
                    last result) resets instead of bleeding across connections. */}
                <CapabilityTabs key={activeConnection?.id} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
