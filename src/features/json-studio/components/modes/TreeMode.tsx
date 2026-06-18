import { useMemo } from 'react'
import JsonTreeNode from '../JsonTreeNode'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input'>

export default function TreeMode({ input }: Props) {
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(input), error: null }
    } catch (e) {
      return { value: null, error: (e as Error).message }
    }
  }, [input])

  return (
    <div className="flex-1 overflow-auto p-5 font-mono">
      {!input.trim() && (
        <p className="text-[12px] text-on-surface-muted">Enter JSON to explore the tree…</p>
      )}
      {parsed.error && (
        <div className="text-[12px] text-red-500 bg-red-50 border border-red-200 rounded-[8px] p-3 font-mono">
          {parsed.error}
        </div>
      )}
      {parsed.value !== null && !parsed.error && (
        <JsonTreeNode value={parsed.value} keyLabel={null} depth={0} />
      )}
    </div>
  )
}
