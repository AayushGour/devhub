import { useMemo, useCallback, useRef, useState } from 'react'
import { FileImage, Printer, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import TreeMode from '@/features/json-studio/components/modes/TreeMode'
import GraphMode, { type GraphModeHandle } from '@/features/json-studio/components/modes/GraphMode'
import SchemaMode from '@/features/json-studio/components/modes/SchemaMode'
import { exportPDFViaHost, exportHTMLViaHost } from '../utils/print'

// Strip // and /* */ comments plus trailing commas so JSONC parses cleanly.
// Uses a state machine to avoid touching comment-like text inside strings.
function stripJsonComments(src: string): string {
  let out = ''
  let i = 0
  let inStr = false
  let escaped = false

  while (i < src.length) {
    const ch = src[i]
    const nx = src[i + 1]

    if (escaped) { out += ch; escaped = false; i++; continue }

    if (inStr) {
      if (ch === '\\') { escaped = true; out += ch; i++; continue }
      if (ch === '"') inStr = false
      out += ch; i++; continue
    }

    if (ch === '"') { inStr = true; out += ch; i++; continue }

    if (ch === '/' && nx === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (ch === '/' && nx === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2; continue
    }

    out += ch; i++
  }

  return out.replace(/,(\s*[}\]])/g, '$1')
}

const MODES = ['tree', 'graph', 'schema'] as const
type Mode = (typeof MODES)[number]
const noop = () => {}

// Convert JSON Lines / NDJSON into a single JSON array so the JSON modes can
// render it. Unparseable lines are preserved so nothing is silently dropped.
function jsonlToArray(text: string): string {
  const items = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { _unparsed: line }
      }
    })
  return JSON.stringify(items, null, 2)
}

const ICON_BTN_CLS =
  'p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

export default function JsonView({ text, format }: { text: string; format?: 'jsonl' }) {
  const [mode, setMode] = useState<Mode>('tree')
  const graphRef = useRef<GraphModeHandle>(null)
  const input = useMemo(
    () => (format === 'jsonl' ? jsonlToArray(text) : stripJsonComments(text)),
    [text, format],
  )
  const handleExportPdf = useCallback((html: string, filename: string) => {
    exportPDFViaHost(html, filename)
  }, [])
  const handleExportHtml = useCallback((html: string, filename: string) => {
    exportHTMLViaHost(html, filename)
  }, [])
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-2 h-9 border-b border-border bg-surface-raised">
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
        {mode === 'tree' && <TreeMode input={input} />}
        {mode === 'graph' && <GraphMode ref={graphRef} input={input} onExportPdf={handleExportPdf} onExportHtml={handleExportHtml} />}
        {mode === 'schema' && <SchemaMode input={input} setInput={noop} />}
      </div>
    </div>
  )
}
