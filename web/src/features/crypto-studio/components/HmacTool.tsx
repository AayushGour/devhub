import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { computeHmac } from '../utils/hmac'
import { HMAC_ALGORITHMS } from '../utils/constants'
import type { HmacAlgorithm } from '../utils/constants'
import { useCopy } from '../hooks/useCopy'

const INPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 font-mono'
const SELECT_CLS =
  'bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const OUTPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs font-mono text-on-surface break-all select-all min-h-[2.38rem]'

export function HmacTool() {
  const [message, setMessage] = useState('')
  const [secret, setSecret] = useState('')
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('SHA-256')
  const [result, setResult] = useState('')
  const { copiedKey, copy } = useCopy()

  useEffect(() => {
    if (!message || !secret) { setResult(''); return }
    computeHmac(message, secret, algorithm)
      .then(setResult)
      .catch(() => setResult(''))
  }, [message, secret, algorithm])

  const copied = copiedKey === 'hmac'

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-3">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Message</span>
        <TextAreaField
          className="flex-1"
          placeholder="Enter message…"
          value={message}
          onChange={setMessage}
        />
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <label className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Secret Key</label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="Enter secret key…"
            value={secret}
            onChange={e => setSecret(e.target.value)}
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Algorithm</span>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value as HmacAlgorithm)}
            className={SELECT_CLS}
          >
            {HMAC_ALGORITHMS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">HMAC Hex</span>
            <button
              onClick={() => copy(result, 'hmac')}
              disabled={!result}
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
          <div className={cn(OUTPUT_CLS, !result && 'text-on-surface-muted italic')}>
            {result || (message && secret ? 'Computing…' : 'Enter message and secret to generate…')}
          </div>
        </div>

        {result && (
          <p className="text-xs text-on-surface-muted">
            {result.length / 2} bytes · {result.length * 4} bits
          </p>
        )}
      </div>
    </div>
  )
}
