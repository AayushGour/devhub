// Tools capability panel. Big split via PanelShell: selector list + arg form +
// sticky Run footer on the left, full-height Result on the right. Self-sufficient
// — reads the active connection's discovered tools + session from the store
// (`useActiveRuntime()` in `../store/mcpStudioStore`), so CapabilityTabs renders
// it with zero props.

import { useState } from 'react'
import { useActiveRuntime } from '../store/mcpStudioStore'
import { callTool } from '@/lib/mcp/client'
import SchemaForm from './SchemaForm'
import ResultView from './ResultView'
import PanelShell, { SelectorRow } from './PanelShell'
import type { CallToolResult } from '@/lib/mcp/types'

const RUN_BTN_CLS = 'px-3 py-1.5 bg-accent text-accent-text text-xs rounded-lg font-medium hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed'

export default function ToolsPanel() {
  const runtime = useActiveRuntime()
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null)
  const [formValue, setFormValue] = useState<Record<string, unknown>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CallToolResult | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)

  // Reset form when selection changes
  const selectTool = (toolName: string) => {
    setSelectedToolName(toolName)
    setFormValue({})
    setResult(null)
    setResultError(null)
  }

  const selectedTool = runtime?.tools.items.find((t) => t.name === selectedToolName)

  // Handle no active runtime
  if (!runtime) {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        Connect to an MCP server to inspect its tools.
      </div>
    )
  }

  // Handle discovery states
  if (runtime.tools.status === 'loading') {
    return <div className="p-4 text-xs text-on-surface-muted">Loading tools…</div>
  }

  if (runtime.tools.status === 'error') {
    return (
      <div className="p-4">
        <p className="text-xs text-red-400 font-medium">Error loading tools</p>
        <p className="text-[0.65rem] text-on-surface-muted mt-1">{runtime.tools.error}</p>
      </div>
    )
  }

  if (runtime.tools.status === 'unsupported') {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        Server doesn't advertise tools.
      </div>
    )
  }

  if (runtime.tools.items.length === 0) {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        No tools available.
      </div>
    )
  }

  // Run tool
  async function handleRun() {
    if (!runtime?.session || !selectedTool) return

    setRunning(true)
    setResultError(null)

    try {
      const callResult = await callTool(runtime.session, selectedTool.name, formValue)
      setResult(callResult)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setResultError(errorMsg)
    } finally {
      setRunning(false)
    }
  }

  const list = runtime.tools.items.map((tool) => (
    <SelectorRow
      key={tool.name}
      selected={selectedToolName === tool.name}
      onClick={() => selectTool(tool.name)}
      title={tool.name}
      subtitle={tool.description}
    />
  ))

  const detail = selectedTool ? (
    <>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-on-surface">{selectedTool.name}</h3>
        {selectedTool.description && (
          <p className="text-xs text-on-surface-muted mt-1">{selectedTool.description}</p>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-on-surface mb-2">Parameters</p>
        <SchemaForm
          key={selectedTool.name}
          source={{
            kind: 'json-schema',
            schema: selectedTool.inputSchema ?? { type: 'object', properties: {} },
          }}
          value={formValue}
          onChange={setFormValue}
          disabled={running}
        />
      </div>
    </>
  ) : (
    <p className="text-xs text-on-surface-muted italic">Select a tool to view details.</p>
  )

  const footer = selectedTool ? (
    <button onClick={handleRun} disabled={!runtime.session || running} className={RUN_BTN_CLS}>
      {running ? 'Running…' : 'Run'}
    </button>
  ) : undefined

  return (
    <PanelShell
      list={list}
      detail={detail}
      footer={footer}
      labelExpand="Show tools"
      labelCollapse="Hide tools"
      result={
        <>
          <p className="text-xs font-medium text-on-surface mb-2 shrink-0">Result</p>
          <div className="flex-1 min-h-0">
            <ResultView
              data={resultError ? null : result}
              isError={!!resultError || result?.isError}
              emptyMessage={resultError || 'Run the tool to see output.'}
            />
          </div>
        </>
      }
    />
  )
}
