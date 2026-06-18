import { cn } from '@/lib/utils'
import type { JsonMode, JsonStudioState } from '../hooks/useJsonStudio'

const MODES: { id: JsonMode; label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'graph', label: 'Graph' },
  { id: 'jsonpath', label: 'JSONPath' },
  { id: 'schema', label: 'Schema' },
  { id: 'types', label: 'Types' },
  { id: 'diff', label: 'Diff' },
]

type Props = Pick<JsonStudioState, 'title' | 'setTitle' | 'mode' | 'setMode'>

export default function JsonToolbar({ title, setTitle, mode, setMode }: Props) {
  return (
    <div className="h-11 flex items-center px-4 gap-[10px] shrink-0 border-b border-border bg-surface">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Untitled JSON"
        className="bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[13px] font-semibold tracking-[-0.2px] font-[inherit] w-[160px] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'px-[10px] py-[4px] rounded-[6px] text-[12px] font-medium font-[inherit] border-none cursor-pointer transition-colors duration-150 tracking-[-0.1px]',
              mode === m.id
                ? 'bg-surface-raised text-on-surface'
                : 'bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
