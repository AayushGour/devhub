import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: unknown
  keyLabel: string | number | null
  depth: number
}

function ValueToken({ value }: { value: unknown }) {
  if (value === null) return <span className="text-json-null italic text-[12px]">null</span>
  if (typeof value === 'boolean') return <span className="text-json-bool text-[12px]">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-json-number text-[12px]">{value}</span>
  if (typeof value === 'string') return (
    <span className="text-json-string text-[12px]">
      &ldquo;{value.length > 100 ? value.slice(0, 100) + '…' : value}&rdquo;
    </span>
  )
  return null
}

function KeyLabel({ label }: { label: string | number | null }) {
  if (label === null) return null
  return (
    <>
      <span className="text-accent text-[12px]">
        {typeof label === 'string' ? `"${label}"` : label}
      </span>
      <span className="text-on-surface-muted text-[12px]">:&nbsp;</span>
    </>
  )
}

export default function JsonTreeNode({ value, keyLabel, depth }: Props) {
  const isObject = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(depth < 2)

  if (!isObject) {
    return (
      <div className="flex items-baseline py-[2px] pl-[2px]">
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
        className="flex items-baseline py-[2px] pl-[2px] cursor-pointer select-none group"
        onClick={() => setOpen(o => !o)}
      >
        <span className={cn(
          'text-[9px] mr-1 text-on-surface-muted transition-transform duration-100 inline-block',
          open ? 'rotate-90' : ''
        )}>
          ▶
        </span>
        <KeyLabel label={keyLabel} />
        <span className="text-on-surface-muted text-[12px]">{openBracket}</span>
        {!open && (
          <>
            <span className="text-on-surface-muted text-[11px] mx-1 opacity-60">{summary}</span>
            <span className="text-on-surface-muted text-[12px]">{closeBracket}</span>
          </>
        )}
      </div>

      {open && (
        <div className="ml-4 border-l border-border pl-3">
          {entries.map(([k, v]) => (
            <JsonTreeNode key={k} value={v} keyLabel={k} depth={depth + 1} />
          ))}
          <div className="py-[2px]">
            <span className="text-on-surface-muted text-[12px]">{closeBracket}</span>
          </div>
        </div>
      )}
    </div>
  )
}
