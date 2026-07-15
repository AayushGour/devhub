import { useState, useRef } from 'react'
import { Copy, Check, ArrowLeftRight, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { encodeBase64, decodeBase64, encodeFileBase64 } from '../utils/base64'
import { useCopy } from '../hooks/useCopy'

const TEXTAREA_CLS =
  'w-full flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 resize-none font-mono'
const TOGGLE_BTN = (active: boolean) =>
  cn(
    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150',
    active
      ? 'bg-accent text-accent-text border-accent'
      : 'bg-surface-raised border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
  )

type Mode = 'encode' | 'decode'

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode')
  const [urlSafe, setUrlSafe] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const { copiedKey, copy } = useCopy()
  const fileRef = useRef<HTMLInputElement>(null)

  let output = ''
  try {
    if (input) {
      output = mode === 'encode' ? encodeBase64(input, urlSafe) : decodeBase64(input, urlSafe)
      if (error) setError('')
    }
  } catch (e) {
    output = ''
    if (!error) setError((e as Error).message)
  }

  function swap() {
    setInput(output)
    setMode(m => (m === 'encode' ? 'decode' : 'encode'))
    setError('')
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await encodeFileBase64(file)
    setInput(b64)
    setMode('decode')
    e.target.value = ''
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setMode('encode')} className={TOGGLE_BTN(mode === 'encode')}>Encode</button>
          <button onClick={() => setMode('decode')} className={TOGGLE_BTN(mode === 'decode')}>Decode</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={urlSafe}
              onChange={e => setUrlSafe(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-on-surface-muted">URL-safe</span>
          </label>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-surface-raised text-on-surface-muted hover:text-on-surface hover:border-accent transition-colors duration-150"
        >
          <Upload size={12} />
          File → Base64
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
      </div>

      {/* Panels */}
      <div className="flex flex-1 min-h-0">
        {/* Left */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-2">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide flex-shrink-0">
            {mode === 'encode' ? 'Plaintext' : 'Base64'}
          </span>
          <textarea
            className={TEXTAREA_CLS}
            placeholder={mode === 'encode' ? 'Enter text to encode…' : 'Paste base64 to decode…'}
            value={input}
            onChange={e => { setInput(e.target.value); setError('') }}
          />
        </div>

        {/* Swap */}
        <div className="flex items-center px-2 flex-shrink-0">
          <Tooltip content="Swap input/output">
            <button
              onClick={swap}
              disabled={!output}
              aria-label="Swap input/output"
              className="p-1.5 rounded-lg text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeftRight size={14} />
            </button>
          </Tooltip>
        </div>

        {/* Right */}
        <div className="flex flex-col flex-1 min-w-0 p-4 gap-2">
          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">
              {mode === 'encode' ? 'Base64' : 'Plaintext'}
            </span>
            <button
              onClick={() => copy(output, 'out')}
              disabled={!output}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors duration-150',
                copiedKey === 'out'
                  ? 'text-accent'
                  : 'text-on-surface-muted hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              {copiedKey === 'out' ? <Check size={12} /> : <Copy size={12} />}
              {copiedKey === 'out' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {error ? (
            <div className="flex-1 flex items-start">
              <span className="text-xs text-red-500 font-mono">{error}</span>
            </div>
          ) : (
            <textarea
              readOnly
              className={cn(TEXTAREA_CLS, 'cursor-default')}
              value={output}
              placeholder={input ? '' : 'Output appears here…'}
            />
          )}
        </div>
      </div>
    </div>
  )
}
