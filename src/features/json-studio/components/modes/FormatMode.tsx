import { useMemo } from 'react'
import { Copy, Minimize2, AlignLeft, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import JsonEditor from '../JsonEditor'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input' | 'setInput'>

function parseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null }
  } catch (e) {
    return { value: null, error: (e as Error).message }
  }
}

function jsonDepth(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  const children = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
  if (children.length === 0) return 1
  return 1 + Math.max(...children.map(jsonDepth))
}

function jsonKeyCount(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  if (Array.isArray(v)) return v.reduce((acc, c) => acc + jsonKeyCount(c), 0)
  const obj = v as Record<string, unknown>
  return Object.keys(obj).length + Object.values(obj).reduce<number>((acc, c) => acc + jsonKeyCount(c), 0)
}

const BTN_CLS = 'flex items-center gap-[5px] px-[10px] py-[5px] rounded-[7px] border border-border bg-transparent text-on-surface-muted text-[12px] cursor-pointer font-[inherit] transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted'

export default function FormatMode({ input, setInput }: Props) {
  const { value, error } = useMemo(() => parseJson(input), [input])

  const format = () => {
    if (value !== undefined && error === null) {
      setInput(JSON.stringify(value, null, 2))
    }
  }

  const minify = () => {
    if (value !== undefined && error === null) {
      setInput(JSON.stringify(value))
    }
  }

  const copy = () => navigator.clipboard.writeText(input)
  const clear = () => setInput('')

  const isValid = error === null && input.trim() !== ''
  const depth = isValid ? jsonDepth(value) : 0
  const keyCount = isValid ? jsonKeyCount(value) : 0
  const lines = input.split('\n').length
  const bytes = new TextEncoder().encode(input).length

  return (
    <div className="flex flex-1 min-h-0">
      <JsonEditor value={input} onChange={setInput} width="60%" />

      <div className="flex-1 flex flex-col p-5 gap-5 overflow-auto">
        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button onClick={format} className={BTN_CLS} disabled={!isValid}>
            <AlignLeft size={13} /> Format
          </button>
          <button onClick={minify} className={BTN_CLS} disabled={!isValid}>
            <Minimize2 size={13} /> Minify
          </button>
          <button onClick={copy} className={BTN_CLS} disabled={!input}>
            <Copy size={13} /> Copy
          </button>
          <button onClick={clear} className={cn(BTN_CLS, 'hover:text-red-500 hover:border-red-300')}>
            <Trash2 size={13} /> Clear
          </button>
        </div>

        {/* Validation */}
        {input.trim() && (
          <div className={cn(
            'flex items-start gap-3 p-4 rounded-[12px] border',
            isValid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}>
            {isValid
              ? <CheckCircle size={16} className="shrink-0 mt-[1px]" />
              : <XCircle size={16} className="shrink-0 mt-[1px]" />
            }
            <div>
              <p className="text-[13px] font-semibold leading-none mb-1">
                {isValid ? 'Valid JSON' : 'Invalid JSON'}
              </p>
              {error && (
                <p className="text-[12px] leading-relaxed font-mono">{error}</p>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {isValid && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Lines', value: lines },
              { label: 'Bytes', value: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B` },
              { label: 'Total keys', value: keyCount },
              { label: 'Max depth', value: depth },
            ].map(stat => (
              <div key={stat.label} className="bg-surface-raised border border-border rounded-[10px] p-3">
                <p className="text-[11px] font-medium text-on-surface-muted uppercase tracking-[0.06em] mb-1">
                  {stat.label}
                </p>
                <p className="text-[20px] font-semibold text-on-surface tracking-[-0.5px] tabular-nums">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
