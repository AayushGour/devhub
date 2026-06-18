import { useMemo, useState } from 'react'
import { evaluateJsonPath } from '../../utils/jsonPath'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input' | 'setInput' | 'jsonPathQuery' | 'setJsonPathQuery'>

const EXAMPLES = [
  '$.features[*]',
  '$.config.theme',
  '$..name',
  '$.features[-1]',
  '$.*',
]

export default function JsonPathMode({ input, jsonPathQuery, setJsonPathQuery }: Props) {
  const [localQuery, setLocalQuery] = useState(jsonPathQuery)

  const { root, parseError } = useMemo(() => {
    try {
      return { root: JSON.parse(input), parseError: null }
    } catch (e) {
      return { root: null, parseError: (e as Error).message }
    }
  }, [input])

  const { results, error: queryError } = useMemo(() => {
    if (root === null) return { results: [], error: null }
    return evaluateJsonPath(root, localQuery)
  }, [root, localQuery])

  const resultJson = useMemo(() => {
    if (results.length === 0) return null
    return JSON.stringify(results.length === 1 ? results[0] : results, null, 2)
  }, [results])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Query input */}
      <div className="border-b border-border p-3 shrink-0">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted mb-2">
          JSONPath Query
        </label>
        <input
          value={localQuery}
          onChange={e => { setLocalQuery(e.target.value); setJsonPathQuery(e.target.value) }}
          placeholder="$.features[*]"
          spellCheck={false}
          className="w-full bg-surface-raised border border-border rounded-[8px] px-3 py-2 text-[13px] font-mono text-on-surface outline-none focus:border-accent transition-colors duration-150"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => { setLocalQuery(ex); setJsonPathQuery(ex) }}
              className="text-[11px] font-mono text-accent bg-surface-raised border border-border rounded-full px-2 py-0.5 cursor-pointer hover:border-accent transition-colors duration-150"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted mb-3">
          Results
          {results.length > 0 && (
            <span className="ml-2 bg-accent text-accent-text rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">
              {results.length}
            </span>
          )}
        </div>

        {parseError && (
          <p className="text-[12px] text-red-500 font-mono bg-red-50 border border-red-200 rounded-[8px] p-3">
            JSON parse error: {parseError}
          </p>
        )}
        {queryError && (
          <p className="text-[12px] text-red-500 font-mono bg-red-50 border border-red-200 rounded-[8px] p-3">
            {queryError}
          </p>
        )}
        {!parseError && !queryError && results.length === 0 && localQuery && (
          <p className="text-[12px] text-on-surface-muted">No matches</p>
        )}
        {resultJson && (
          <pre className="text-[12px] font-mono text-on-surface bg-surface-raised border border-border rounded-[10px] p-4 overflow-auto whitespace-pre leading-relaxed">
            {resultJson}
          </pre>
        )}
      </div>
    </div>
  )
}
