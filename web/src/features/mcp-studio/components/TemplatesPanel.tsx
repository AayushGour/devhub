// [ROUND 2] resource templates: uriTemplate + fill params → expand → Read
// (reuse ResourcesPanel's read flow / ResultView). Self-sufficient — reads
// discovered templates + session from the store (`../store/mcpStudioStore`);
// no props.

import { useState, useMemo } from 'react'
import { useActiveRuntime } from '../store/mcpStudioStore'
import { readResource } from '@/lib/mcp/client'
import { extractTemplateParams, expandUriTemplate } from '../utils/uriTemplate'
import ResultView from './ResultView'
import PanelShell, { SelectorRow } from './PanelShell'
import type { ReadResourceResult } from '@/lib/mcp/types'

const READ_BTN_CLS = 'px-3 py-1.5 bg-accent text-accent-text text-xs rounded-lg font-medium hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed'

export default function TemplatesPanel() {
  const runtime = useActiveRuntime()
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ReadResourceResult | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateIndex === null || !runtime?.templates.items[selectedTemplateIndex]) {
      return null
    }
    return runtime.templates.items[selectedTemplateIndex]
  }, [runtime, selectedTemplateIndex])

  const templateParams = useMemo(() => {
    if (!selectedTemplate?.uriTemplate) return []
    return extractTemplateParams(selectedTemplate.uriTemplate)
  }, [selectedTemplate])

  const expandedUri = useMemo(() => {
    if (!selectedTemplate?.uriTemplate) return ''
    return expandUriTemplate(selectedTemplate.uriTemplate, paramValues)
  }, [selectedTemplate, paramValues])

  // Reset form when selection changes
  const selectTemplate = (index: number) => {
    setSelectedTemplateIndex(index)
    setParamValues({})
    setResult(null)
    setResultError(null)
  }

  // Handle no active runtime
  if (!runtime) {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        Connect to an MCP server to inspect its resource templates.
      </div>
    )
  }

  // Handle discovery states
  if (runtime.templates.status === 'loading') {
    return <div className="p-4 text-xs text-on-surface-muted">Loading resource templates…</div>
  }

  if (runtime.templates.status === 'error') {
    return (
      <div className="p-4">
        <p className="text-xs text-red-400 font-medium">Error loading resource templates</p>
        <p className="text-[0.65rem] text-on-surface-muted mt-1">{runtime.templates.error}</p>
      </div>
    )
  }

  if (runtime.templates.status === 'unsupported') {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        Server doesn't advertise resource templates.
      </div>
    )
  }

  if (runtime.templates.items.length === 0) {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">
        No resource templates available.
      </div>
    )
  }

  // Handle read
  async function handleRead() {
    if (!runtime?.session || !selectedTemplate) return

    setRunning(true)
    setResultError(null)
    setResult(null)

    try {
      const readResult = await readResource(runtime.session, expandedUri)
      setResult(readResult)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setResultError(errorMsg)
    } finally {
      setRunning(false)
    }
  }

  // Check if all required params are filled
  const allParamsFilled = templateParams.every((p) => paramValues[p]?.trim())
  const isReadDisabled = !runtime.session || running || !allParamsFilled

  const list = runtime.templates.items.map((template, idx) => (
    <SelectorRow
      key={idx}
      selected={selectedTemplateIndex === idx}
      onClick={() => selectTemplate(idx)}
      title={template.name ?? template.uriTemplate}
      subtitle={template.uriTemplate}
    />
  ))

  const detail = selectedTemplate ? (
    <>
      <div className="mb-3">
        <h3 className="text-sm font-medium text-on-surface">{selectedTemplate.name || 'Resource Template'}</h3>
        {selectedTemplate.description && (
          <p className="text-xs text-on-surface-muted mt-1">{selectedTemplate.description}</p>
        )}
      </div>

      <div className="mb-3 p-2 bg-surface-raised rounded-lg border border-border">
        <p className="text-[0.65rem] text-on-surface-muted mb-1">URI Template</p>
        <p className="text-xs font-mono text-on-surface break-all">{selectedTemplate.uriTemplate}</p>
      </div>

      {templateParams.length > 0 && (
        <div className="mb-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-on-surface mb-2">Parameters</p>
          <div className="space-y-2">
            {templateParams.map((param) => (
              <div key={param}>
                <label className="text-xs text-on-surface-muted block mb-1">{param}</label>
                <input
                  type="text"
                  value={paramValues[param] ?? ''}
                  onChange={(e) => {
                    setParamValues((prev) => ({ ...prev, [param]: e.target.value }))
                  }}
                  placeholder={`Enter ${param}…`}
                  disabled={running}
                  className="w-full px-2 py-1.5 text-xs bg-surface border border-border rounded-lg text-on-surface placeholder-on-surface-muted/40 outline-none focus:border-accent transition-colors duration-150 disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-2 bg-surface-raised rounded-lg border border-border">
        <p className="text-[0.65rem] text-on-surface-muted mb-1">Concrete URI</p>
        <p className="text-xs font-mono text-on-surface break-all">{expandedUri}</p>
      </div>
    </>
  ) : (
    <p className="text-xs text-on-surface-muted italic">Select a template to view details.</p>
  )

  const footer = selectedTemplate ? (
    <button onClick={handleRead} disabled={isReadDisabled} className={READ_BTN_CLS}>
      {running ? 'Reading…' : 'Read'}
    </button>
  ) : undefined

  return (
    <PanelShell
      list={list}
      detail={detail}
      footer={footer}
      labelExpand="Show templates"
      labelCollapse="Hide templates"
      result={
        <>
          <p className="text-xs font-medium text-on-surface mb-2 shrink-0">Result</p>
          <div className="flex-1 min-h-0">
            <ResultView
              data={resultError ? null : result}
              isError={!!resultError}
              emptyMessage={resultError || 'Click Read to fetch the resource.'}
            />
          </div>
        </>
      }
    />
  )
}
