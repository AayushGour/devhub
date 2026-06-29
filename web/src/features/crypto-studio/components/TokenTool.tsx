import { useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOKEN_FORMATS, TOKEN_BITS } from '../utils/constants'
import type { TokenFormat, TokenBits } from '../utils/constants'
import { useCopy } from '../hooks/useCopy'

const OUTPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-3 text-sm font-mono text-on-surface break-all select-all min-h-20'

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generateToken(format: TokenFormat, bits: number): string {
  if (format === 'uuid') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  const bytes = crypto.getRandomValues(new Uint8Array(bits / 8))
  if (format === 'hex') {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  if (format === 'base64') {
    return btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }
  // alphanumeric
  return Array.from(bytes).map(b => ALPH[b % ALPH.length]).join('')
}

export function TokenTool() {
  const [format, setFormat] = useState<TokenFormat>('hex')
  const [bits, setBits] = useState<TokenBits>(256)
  const [output, setOutput] = useState('')
  const { copiedKey, copy } = useCopy()

  function generate() {
    setOutput(generateToken(format, bits))
  }

  const copied = copiedKey === 'token'
  const isUuid = format === 'uuid'

  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 gap-6 max-w-2xl">
      {/* Format */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Format</span>
        <div className="flex items-center gap-2">
          {TOKEN_FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150',
                format === f.id
                  ? 'bg-accent text-accent-text border-accent'
                  : 'bg-surface-raised border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bits */}
      {!isUuid && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Length</span>
          <div className="flex items-center gap-2">
            {TOKEN_BITS.map(b => (
              <button
                key={b}
                onClick={() => setBits(b)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150',
                  bits === b
                    ? 'bg-accent text-accent-text border-accent'
                    : 'bg-surface-raised border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
                )}
              >
                {b} bits
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generate */}
      <button
        onClick={generate}
        className="flex items-center gap-2 self-start px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-text hover:bg-accent-hover transition-colors duration-150"
      >
        <RefreshCw size={14} />
        Generate
      </button>

      {/* Output */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Output</span>
          <button
            onClick={() => copy(output, 'token')}
            disabled={!output}
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
        <div className={cn(OUTPUT_CLS, !output && 'text-on-surface-muted italic')}>
          {output || 'Click Generate…'}
        </div>
        {output && !isUuid && (
          <p className="text-xs text-on-surface-muted">{output.length} characters</p>
        )}
      </div>
    </div>
  )
}
