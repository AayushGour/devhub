import { useMemo } from 'react'
import { Copy } from 'lucide-react'
import JsonEditor from '../JsonEditor'
import { buildSchema } from '../../utils/schemaGenerator'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input' | 'setInput'>

export default function SchemaMode({ input }: Props) {
  const { schema, error } = useMemo(() => {
    try {
      const value = JSON.parse(input)
      return { schema: buildSchema(value), error: null }
    } catch (e) {
      return { schema: '', error: (e as Error).message }
    }
  }, [input])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-9 flex items-center px-4 gap-2 shrink-0 border-b border-border bg-surface-raised">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted flex-1">
          JSON Schema (draft-07)
        </span>
        {schema && (
          <button
            onClick={() => navigator.clipboard.writeText(schema)}
            className="flex items-center gap-[5px] text-[11px] text-on-surface-muted hover:text-on-surface transition-colors duration-150 cursor-pointer bg-transparent border-none font-[inherit]"
          >
            <Copy size={12} /> Copy
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 text-[12px] text-red-500 font-mono">
          {error}
        </div>
      )}

      {schema && !error && (
        <div className="flex-1 min-h-0">
          <JsonEditor value={schema} readOnly width="100%" />
        </div>
      )}

      {!input.trim() && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[12px] text-on-surface-muted">Enter JSON to generate schema</p>
        </div>
      )}
    </div>
  )
}
