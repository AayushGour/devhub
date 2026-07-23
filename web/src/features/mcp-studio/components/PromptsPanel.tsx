// Prompts capability panel. Big split via PanelShell: selector list + arg form +
// sticky Get footer on the left, full-height Result on the right. Self-sufficient
// — reads the active connection's discovered prompts + session from the store
// (`useActiveRuntime()` in `../store/mcpStudioStore`), so CapabilityTabs renders
// it with zero props.

import { useState } from 'react'
import { getPrompt } from '@/lib/mcp/client'
import { useActiveRuntime } from '../store/mcpStudioStore'
import SchemaForm from './SchemaForm'
import ResultView from './ResultView'
import PanelShell, { SelectorRow } from './PanelShell'
import { DiscoveryStateView } from './DiscoveryStateView'
import { PANEL_ACTION_BTN_CLS } from '../styles'
import type { McpPrompt, GetPromptResult } from '@/lib/mcp/types'

export default function PromptsPanel() {
  const runtime = useActiveRuntime()
  const [selectedPrompt, setSelectedPrompt] = useState<McpPrompt | null>(null)
  const [args, setArgs] = useState<Record<string, unknown>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<GetPromptResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset args/result when selection changes
  const selectPrompt = (prompt: McpPrompt) => {
    setSelectedPrompt(prompt)
    setArgs({})
    setResult(null)
    setError(null)
  }

  // Handle no active runtime
  if (!runtime) {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        Connect to an MCP server to inspect its prompts.
      </div>
    )
  }

  // Handle discovery states (loading / error / unsupported / empty)
  const gate = DiscoveryStateView({ state: runtime.prompts, noun: 'prompts' })
  if (gate) return gate

  // Get prompt
  async function handleGetPrompt() {
    if (!runtime?.session || !selectedPrompt) return

    setRunning(true)
    setError(null)

    try {
      // MCP prompt arguments are always strings (see design doc / MCP spec).
      // SchemaForm's onChange is typed Record<string, unknown>, so coerce here.
      const stringArgs: Record<string, string> = {}
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined && v !== null) stringArgs[k] = typeof v === 'string' ? v : String(v)
      }
      const callResult = await getPrompt(runtime.session, selectedPrompt.name, stringArgs)
      setResult(callResult)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
    } finally {
      setRunning(false)
    }
  }

  const list = runtime.prompts.items.map((prompt) => (
    <SelectorRow
      key={prompt.name}
      selected={selectedPrompt?.name === prompt.name}
      onClick={() => selectPrompt(prompt)}
      title={prompt.name}
      subtitle={prompt.description}
    />
  ))

  const detail = selectedPrompt ? (
    <>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-on-surface">{selectedPrompt.name}</h3>
        {selectedPrompt.description && (
          <p className="text-xs text-on-surface-muted mt-1">{selectedPrompt.description}</p>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-on-surface mb-2">Arguments</p>
        <SchemaForm
          key={selectedPrompt.name}
          source={{
            kind: 'prompt-arguments',
            arguments: selectedPrompt.arguments ?? [],
          }}
          value={args}
          onChange={setArgs}
          disabled={running}
        />
      </div>
    </>
  ) : (
    <p className="text-xs text-on-surface-muted italic">Select a prompt to view details.</p>
  )

  const footer = selectedPrompt ? (
    <button onClick={handleGetPrompt} disabled={!runtime.session || running} className={PANEL_ACTION_BTN_CLS}>
      {running ? 'Getting…' : 'Get'}
    </button>
  ) : undefined

  return (
    <PanelShell
      list={list}
      detail={detail}
      footer={footer}
      labelExpand="Show prompts"
      labelCollapse="Hide prompts"
      result={
        <>
          <p className="text-xs font-medium text-on-surface mb-2 shrink-0">Result</p>
          <div className="flex-1 min-h-0">
            <ResultView
              data={error ? null : result}
              isError={!!error}
              emptyMessage={error || 'Get a prompt to see output.'}
            />
          </div>
        </>
      }
    />
  )
}
