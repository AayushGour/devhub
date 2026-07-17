import { useState } from 'react'
import { Copy, Check, AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { decodeToken, encodeToken } from '../utils/jwt'
import type { JwtDecoded } from '../utils/jwt'
import { JWT_ALGORITHMS } from '../utils/constants'
import type { JwtSubMode, JwtAlgorithm } from '../utils/constants'
import { useCopy } from '../hooks/useCopy'

const INPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 font-mono'
const SELECT_CLS =
  'bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const BLOCK_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs font-mono text-on-surface break-all select-all whitespace-pre-wrap'
const TOGGLE_BTN = (active: boolean) =>
  cn(
    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150',
    active
      ? 'bg-accent text-accent-text border-accent'
      : 'bg-surface-raised border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
  )

const DEFAULT_PAYLOAD = JSON.stringify({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }, null, 2)

export function JwtTool() {
  const [subMode, setSubMode] = useState<JwtSubMode>('decode')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0">
        <button onClick={() => setSubMode('decode')} className={TOGGLE_BTN(subMode === 'decode')}>Decode</button>
        <button onClick={() => setSubMode('encode')} className={TOGGLE_BTN(subMode === 'encode')}>Encode</button>
      </div>
      {subMode === 'decode' ? <JwtDecode /> : <JwtEncode />}
    </div>
  )
}

function JwtDecode() {
  const [token, setToken] = useState('')
  const [decoded, setDecoded] = useState<JwtDecoded | null>(null)
  const [error, setError] = useState('')
  const { copiedKey, copy } = useCopy()

  function handleChange(val: string) {
    setToken(val)
    if (!val.trim()) { setDecoded(null); setError(''); return }
    try {
      setDecoded(decodeToken(val))
      setError('')
    } catch (e) {
      setDecoded(null)
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-2">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">JWT Token</span>
        <TextAreaField
          className="flex-1"
          placeholder="Paste JWT here…"
          value={token}
          onChange={handleChange}
          spellCheck={false}
        />
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle size={12} />
            {error}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-4 overflow-auto">
        {decoded ? (
          <>
            {/* Expiry badge */}
            {decoded.hasExp && (
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium self-start',
                decoded.isExpired
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                  : 'bg-green-500/10 text-green-600 border border-green-500/20',
              )}>
                {decoded.isExpired ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                {decoded.isExpired ? 'Token expired' : 'Token valid'}
              </div>
            )}

            <JsonBlock
              label="Header"
              value={JSON.stringify(decoded.header, null, 2)}
              copyKey="header"
              copiedKey={copiedKey}
              onCopy={copy}
            />
            <JsonBlock
              label="Payload"
              value={JSON.stringify(decoded.payload, null, 2)}
              copyKey="payload"
              copiedKey={copiedKey}
              onCopy={copy}
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Signature</span>
                <CopyBtn value={decoded.signature} copyKey="sig" copiedKey={copiedKey} onCopy={copy} />
              </div>
              <div className={cn(BLOCK_CLS, 'text-on-surface-muted')}>{decoded.signature}</div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-sm text-on-surface-muted">
            Paste a JWT to decode
          </div>
        )}
      </div>
    </div>
  )
}

function JwtEncode() {
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD)
  const [secret, setSecret] = useState('your-256-bit-secret')
  const [algorithm, setAlgorithm] = useState<JwtAlgorithm>('HS256')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { copiedKey, copy } = useCopy()

  async function sign() {
    setError('')
    setLoading(true)
    try {
      const jwt = await encodeToken(payload, secret, algorithm)
      setOutput(jwt)
    } catch (e) {
      setError((e as Error).message)
      setOutput('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-3">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Payload (JSON)</span>
        <TextAreaField
          className="flex-1"
          value={payload}
          onChange={setPayload}
          spellCheck={false}
        />
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <label className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Algorithm</label>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value as JwtAlgorithm)}
            className={SELECT_CLS}
          >
            {JWT_ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <label className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Secret</label>
          <input
            type="text"
            className={INPUT_CLS}
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Enter secret…"
          />
        </div>
        <button
          onClick={sign}
          disabled={loading || !secret}
          className="self-start px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-text hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing…' : 'Sign JWT'}
        </button>
      </div>

      {/* Right */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Signed JWT</span>
          <CopyBtn value={output} copyKey="jwt" copiedKey={copiedKey} onCopy={copy} />
        </div>
        {error ? (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle size={12} />
            {error}
          </div>
        ) : (
          <div className={cn(BLOCK_CLS, !output && 'text-on-surface-muted italic min-h-20')}>
            {output || 'Signed token appears here…'}
          </div>
        )}
      </div>
    </div>
  )
}

function JsonBlock({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string
  value: string
  copyKey: string
  copiedKey: string | null
  onCopy: (v: string, k: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">{label}</span>
        <CopyBtn value={value} copyKey={copyKey} copiedKey={copiedKey} onCopy={onCopy} />
      </div>
      <pre className={BLOCK_CLS}>{value}</pre>
    </div>
  )
}

function CopyBtn({
  value,
  copyKey,
  copiedKey,
  onCopy,
}: {
  value: string
  copyKey: string
  copiedKey: string | null
  onCopy: (v: string, k: string) => void
}) {
  const copied = copiedKey === copyKey
  return (
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
  )
}
