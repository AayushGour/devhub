import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import TreeMode from '@/features/json-studio/components/modes/TreeMode'
import GraphMode from '@/features/json-studio/components/modes/GraphMode'
import SchemaMode from '@/features/json-studio/components/modes/SchemaMode'

const MODES = ['graph', 'tree', 'schema'] as const
type Mode = (typeof MODES)[number]
const noop = () => {}

interface Props {
  /** Pre-serialised JSON string */
  input: string
  error?: string
}

export default function DataView({ input, error }: Props) {
  const [mode, setMode] = useState<Mode>('graph')

  const safeInput = useMemo(() => {
    if (!input.trim()) return ''
    try { JSON.parse(input); return input } catch { return '' }
  }, [input])

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
      </div>
      <div className="flex flex-1 min-h-0">
        {error && (
          <div className="p-4 text-xs text-red-500 font-mono">{error}</div>
        )}
        {!error && mode === 'graph' && <GraphMode input={safeInput} />}
        {!error && mode === 'tree' && <TreeMode input={safeInput} />}
        {!error && mode === 'schema' && <SchemaMode input={safeInput} setInput={noop} />}
      </div>
    </div>
  )
}
