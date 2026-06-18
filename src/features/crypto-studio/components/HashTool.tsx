import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeHash } from '../utils/hash'
import { HASH_ALGORITHMS } from '../utils/constants'
import type { HashAlgorithm } from '../utils/constants'
import { useCopy } from '../hooks/useCopy'

const TEXTAREA_CLS =
  'w-full flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 resize-none font-mono'
const SELECT_CLS =
  'bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const OUTPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs font-mono text-on-surface break-all select-all min-h-[38px]'

interface HashResult {
  hex: string
  base64: string
}

export function HashTool() {
  const [input, setInput] = useState('')
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('SHA-256')
  const [result, setResult] = useState<HashResult | null>(null)
  const { copiedKey, copy } = useCopy()

  useEffect(() => {
    if (!input) { setResult(null); return }
    computeHash(input, algorithm)
      .then(setResult)
      .catch(() => setResult(null))
  }, [input, algorithm])

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Input</span>
        </div>
        <textarea
          className={TEXTAREA_CLS}
          placeholder="Enter text to hash…"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Algorithm</span>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value as HashAlgorithm)}
            className={SELECT_CLS}
          >
            {HASH_ALGORITHMS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <OutputRow
          label="Hex"
          value={result?.hex ?? ''}
          copyKey="hex"
          copiedKey={copiedKey}
          onCopy={copy}
          empty={!input}
        />
        <OutputRow
          label="Base64"
          value={result?.base64 ?? ''}
          copyKey="b64"
          copiedKey={copiedKey}
          onCopy={copy}
          empty={!input}
        />
      </div>
    </div>
  )
}

function OutputRow({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  empty,
}: {
  label: string
  value: string
  copyKey: string
  copiedKey: string | null
  onCopy: (v: string, k: string) => void
  empty: boolean
}) {
  const copied = copiedKey === copyKey
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">{label}</span>
        <button
          onClick={() => onCopy(value, copyKey)}
          disabled={!value}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors duration-150',
            copied
              ? 'text-accent'
              : 'text-on-surface-muted hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={cn(OUTPUT_CLS, empty && 'text-on-surface-muted italic')}>
        {empty ? 'Type to generate…' : value}
      </div>
    </div>
  )
}
