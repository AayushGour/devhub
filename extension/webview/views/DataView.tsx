import { useMemo, useRef, useCallback, useState } from 'react'
import { FileImage, Printer, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import TreeMode from '@/features/json-studio/components/modes/TreeMode'
import GraphMode, { type GraphModeHandle } from '@/features/json-studio/components/modes/GraphMode'
import SchemaMode from '@/features/json-studio/components/modes/SchemaMode'
import { exportPDFViaHost, exportHTMLViaHost } from '../utils/print'

const MODES = ['graph', 'tree', 'schema'] as const
type Mode = (typeof MODES)[number]
const noop = () => {}

const ICON_BTN_CLS =
  'p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

interface Props {
  /** Pre-serialised JSON string */
  input: string
  error?: string
}

export default function DataView({ input, error }: Props) {
  const [mode, setMode] = useState<Mode>('graph')
  const graphRef = useRef<GraphModeHandle>(null)

  const safeInput = useMemo(() => {
    if (!input.trim()) return ''
    try { JSON.parse(input); return input } catch { return '' }
  }, [input])

  const handleExportPdf = useCallback((html: string, filename: string) => {
    exportPDFViaHost(html, filename)
  }, [])
  const handleExportHtml = useCallback((html: string, filename: string) => {
    exportHTMLViaHost(html, filename)
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center gap-1 px-2 h-9 border-b border-border bg-surface-raised">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md capitalize transition-colors duration-150',
              mode === m
                ? 'bg-accent text-accent-text'
                : 'text-on-surface-muted hover:bg-surface-hover hover:text-on-surface',
            )}
          >
            {m}
          </button>
        ))}
        {mode === 'graph' && (
          <div className="ml-auto flex items-center gap-0.5">
            <button title="Export PNG" className={ICON_BTN_CLS} onClick={() => graphRef.current?.exportPng()}>
              <FileImage size={14} />
            </button>
            <button title="Export PDF" className={ICON_BTN_CLS} onClick={() => graphRef.current?.exportPdf()}>
              <Printer size={14} />
            </button>
            <button title="Export HTML" className={ICON_BTN_CLS} onClick={() => graphRef.current?.exportHtml()}>
              <FileCode size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-1 min-h-0">
        {error && (
          <div className="p-4 text-xs text-red-500 font-mono">{error}</div>
        )}
        {!error && mode === 'graph' && <GraphMode ref={graphRef} input={safeInput} onExportPdf={handleExportPdf} onExportHtml={handleExportHtml} />}
        {!error && mode === 'tree' && <TreeMode input={safeInput} />}
        {!error && mode === 'schema' && <SchemaMode input={safeInput} setInput={noop} />}
      </div>
    </div>
  )
}
