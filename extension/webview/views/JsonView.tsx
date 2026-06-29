import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import TreeMode from '@/features/json-studio/components/modes/TreeMode'
import GraphMode from '@/features/json-studio/components/modes/GraphMode'
import SchemaMode from '@/features/json-studio/components/modes/SchemaMode'

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

export default function JsonView({ text, format }: { text: string; format?: 'jsonl' }) {
  const [mode, setMode] = useState<Mode>('tree')
  const input = useMemo(() => (format === 'jsonl' ? jsonlToArray(text) : text), [text, format])
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
      </div>
      <div className="flex flex-1 min-h-0">
        {mode === 'tree' && <TreeMode input={input} />}
        {mode === 'graph' && <GraphMode input={input} />}
        {mode === 'schema' && <SchemaMode input={input} setInput={noop} />}
      </div>
    </div>
  )
}
