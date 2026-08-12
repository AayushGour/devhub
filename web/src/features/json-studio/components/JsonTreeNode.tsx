import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: unknown
  keyLabel: string | number | null
  depth: number
}

function ValueToken({ value }: { value: unknown }) {
  if (value === null) return <span className="text-json-null italic text-[0.75rem]">null</span>
  if (typeof value === 'boolean') return <span className="text-json-bool text-[0.75rem]">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-json-number text-[0.75rem]">{value}</span>
  if (typeof value === 'string') {
    return (
      <span className="text-json-string text-[0.75rem] break-words whitespace-pre-wrap">
        &ldquo;{value}&rdquo;
      </span>
    )
  }
  return null
}

function KeyLabel({ label }: { label: string | number | null }) {
  if (label === null) return null
  const str = typeof label === 'string' ? `"${label}"` : String(label)
  const long = typeof label === 'string' && label.length > 30
  return (
    <>
      <span className="text-accent text-[0.75rem]" title={long ? str : undefined}>
        {str}
      </span>
      <span className="text-on-surface-muted text-[0.75rem]">:&nbsp;</span>
    </>
  )
}

export default function JsonTreeNode({ value, keyLabel, depth }: Props) {
  const isObject = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(depth < 2)

  if (!isObject) {
    return (
      <div className="flex items-baseline flex-wrap py-[0.12rem] pl-[0.12rem]">
        <KeyLabel label={keyLabel} />
        <ValueToken value={value} />
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
    : Object.entries(value as Record<string, unknown>)
  const count = entries.length
  const openBracket = isArray ? '[' : '{'
  const closeBracket = isArray ? ']' : '}'
  const summary = isArray ? `${count} item${count !== 1 ? 's' : ''}` : `${count} key${count !== 1 ? 's' : ''}`

  return (
    <div>
      <div
        className="flex items-baseline py-[0.12rem] pl-[0.12rem] cursor-pointer select-none group"
        onClick={() => setOpen(o => !o)}
      >
        <span className={cn(
          'text-[0.56rem] mr-1 text-on-surface-muted transition-transform duration-100 inline-block',
          open ? 'rotate-90' : ''
        )}>
          ▶
        </span>
        <KeyLabel label={keyLabel} />
        <span className="text-on-surface-muted text-[0.75rem]">{openBracket}</span>
        {!open && (
          <>
            <span className="text-on-surface-muted text-[0.69rem] mx-1 opacity-60">{summary}</span>
            <span className="text-on-surface-muted text-[0.75rem]">{closeBracket}</span>
          </>
        )}
      </div>

      {open && (
        <div className="ml-4 border-l border-border pl-3">
          {entries.map(([k, v]) => (
            <JsonTreeNode key={k} value={v} keyLabel={k} depth={depth + 1} />
          ))}
          <div className="py-[0.12rem]">
            <span className="text-on-surface-muted text-[0.75rem]">{closeBracket}</span>
          </div>
        </div>
      )}
    </div>
  )
}
