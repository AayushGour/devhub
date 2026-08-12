// Resources capability panel. Big split via PanelShell: selector list + metadata +
// sticky Read footer on the left, full-height Result on the right. Self-sufficient
// — reads discovered resources + session from the store (`../store/mcpStudioStore`),
// so CapabilityTabs renders it with zero props.

import { useState } from 'react'
import { useActiveRuntime } from '../store/mcpStudioStore'
import { readResource } from '@/lib/mcp/client'
import ResultView from './ResultView'
import PanelShell, { SelectorRow } from './PanelShell'
import { DiscoveryStateView } from './DiscoveryStateView'
import { PANEL_ACTION_BTN_CLS } from '../styles'
import type { ReadResourceResult } from '@/lib/mcp/types'

export default function ResourcesPanel() {
  const runtime = useActiveRuntime()
  const [selectedUri, setSelectedUri] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<ReadResourceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset result/error when selection changes
  const selectResource = (uri: string) => {
    setSelectedUri(uri)
    setLastResult(null)
    setError(null)
  }

  if (!runtime) return <div className="p-4 text-xs text-on-surface-muted">No active runtime.</div>

  const { resources, session } = runtime

  // Discovery state rendering (loading / error / unsupported / empty)
  const gate = DiscoveryStateView({ state: resources, noun: 'resources' })
  if (gate) return gate

  const selectedResource = resources.items.find((r) => r.uri === selectedUri)

  async function handleRead() {
    if (!selectedResource || !session || running) return

    setRunning(true)
    setError(null)
    setLastResult(null)

    try {
      const result = await readResource(session, selectedResource.uri)
      setLastResult(result)
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  const list = resources.items.map((resource) => (
    <SelectorRow
      key={resource.uri}
      selected={selectedUri === resource.uri}
      onClick={() => selectResource(resource.uri)}
      title={resource.name || resource.uri}
      subtitle={resource.mimeType || resource.uri}
    />
  ))

  const detail = selectedResource ? (
    <>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-on-surface">{selectedResource.name || selectedResource.uri}</h3>
        {selectedResource.description && (
          <p className="text-xs text-on-surface-muted mt-1">{selectedResource.description}</p>
        )}
      </div>
      <div className="border-t border-border pt-3 space-y-2">
        <div>
          <p className="text-[0.65rem] text-on-surface-muted">URI</p>
          <p className="text-xs text-on-surface font-mono break-all">{selectedResource.uri}</p>
        </div>
        {selectedResource.name && (
          <div>
            <p className="text-[0.65rem] text-on-surface-muted">Name</p>
            <p className="text-xs text-on-surface">{selectedResource.name}</p>
          </div>
        )}
        {selectedResource.mimeType && (
          <div>
            <p className="text-[0.65rem] text-on-surface-muted">MIME Type</p>
            <p className="text-xs text-on-surface font-mono">{selectedResource.mimeType}</p>
          </div>
        )}
      </div>
    </>
  ) : (
    <p className="text-xs text-on-surface-muted italic">Select a resource to view details.</p>
  )

  const footer = selectedResource ? (
    <button onClick={handleRead} disabled={!session || running} className={PANEL_ACTION_BTN_CLS}>
      {running ? 'Reading…' : 'Read'}
    </button>
  ) : undefined

  return (
    <PanelShell
      list={list}
      detail={detail}
      footer={footer}
      labelExpand="Show resources"
      labelCollapse="Hide resources"
      result={
        <>
          <p className="text-xs font-medium text-on-surface mb-2 shrink-0">Result</p>
          <div className="flex-1 min-h-0 overflow-auto">
            {error ? (
              <ResultView data={{ error }} isError emptyMessage="" />
            ) : lastResult ? (
              <ResourceContentView result={lastResult} />
            ) : (
              <ResultView data={null} emptyMessage="Read a resource to see its contents." />
            )}
          </div>
        </>
      }
    />
  )
}

/**
 * Render ReadResourceResult contents.
 * Show text when present; for blob (base64) show a note + size.
 */
function ResourceContentView({ result }: { result: ReadResourceResult }) {
  if (!result.contents || result.contents.length === 0) {
    return <ResultView data={null} emptyMessage="No content returned." />
  }

  // If there's text content in any block, render via ResultView (pretty/raw toggle)
  const hasText = result.contents.some((c) => c.text)
  if (hasText) {
    return <ResultView data={result} emptyMessage="No content." />
  }

  // For blob-only content, show a note + size
  return (
    <div className="space-y-3">
      {result.contents.map((content, i) => (
        <div key={i} className="border border-border rounded-lg p-3 text-xs">
          <p className="text-on-surface-muted mb-2">
            Binary content ({content.mimeType || 'unknown type'})
          </p>
          {content.blob && (
            <p className="text-on-surface-muted text-[0.65rem]">
              Encoded: {(content.blob.length / 1024).toFixed(2)} KB
            </p>
          )}
          <p className="text-on-surface-muted text-[0.65rem] mt-1">
            Use the Raw view to inspect the full base64-encoded data.
          </p>
          <pre className="bg-surface-raised rounded mt-2 p-2 max-h-48 overflow-auto text-[0.6rem] text-on-surface font-mono whitespace-pre-wrap break-all">
            {content.blob ? content.blob.slice(0, 200) + (content.blob.length > 200 ? '…' : '') : '(no data)'}
          </pre>
        </div>
      ))}
    </div>
  )
}
