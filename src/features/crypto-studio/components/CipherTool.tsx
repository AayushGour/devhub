import { useState } from 'react'
import { Copy, Check, RefreshCw, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { encryptText, decryptText, generatePassword } from '../utils/cipher'
import { CIPHER_ALGORITHMS } from '../utils/constants'
import type { CipherAlgorithm, CipherMode, CipherInputFormat } from '../utils/constants'
import { useCopy } from '../hooks/useCopy'

const TEXTAREA_CLS =
  'w-full flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 resize-none font-mono'
const INPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 font-mono'
const SELECT_CLS =
  'bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const OUTPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs font-mono text-on-surface break-all select-all min-h-[60px] whitespace-pre-wrap'
const TOGGLE_BTN = (active: boolean) =>
  cn(
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150',
    active
      ? 'bg-accent text-accent-text border-accent'
      : 'bg-surface-raised border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
  )

interface EncryptResult {
  hex: string
  base64: string
}

export function CipherTool() {
  const [algorithm, setAlgorithm] = useState<CipherAlgorithm>('AES-256-GCM')
  const [cipherMode, setCipherMode] = useState<CipherMode>('encrypt')
  const [password, setPassword] = useState('')
  const [input, setInput] = useState('')
  const [inputFormat, setInputFormat] = useState<CipherInputFormat>('base64')
  const [encResult, setEncResult] = useState<EncryptResult | null>(null)
  const [decResult, setDecResult] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { copiedKey, copy } = useCopy()

  function genPassword() {
    setPassword(generatePassword())
  }

  async function process() {
    if (!input || !password) return
    setError('')
    setLoading(true)
    try {
      if (cipherMode === 'encrypt') {
        const result = await encryptText(input, password, algorithm)
        setEncResult(result)
        setDecResult('')
      } else {
        const result = await decryptText(input, password, algorithm, inputFormat)
        setDecResult(result)
        setEncResult(null)
      }
    } catch (e) {
      setError((e as Error).message)
      setEncResult(null)
      setDecResult('')
    } finally {
      setLoading(false)
    }
  }

  const btnLabel = loading
    ? cipherMode === 'encrypt' ? 'Encrypting…' : 'Decrypting…'
    : cipherMode === 'encrypt' ? 'Encrypt' : 'Decrypt'

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left — controls + input */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border p-4 gap-3">
        {/* Algorithm */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Algorithm</span>
          <select
            value={algorithm}
            onChange={e => setAlgorithm(e.target.value as CipherAlgorithm)}
            className={SELECT_CLS}
          >
            {CIPHER_ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Mode */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setCipherMode('encrypt')} className={TOGGLE_BTN(cipherMode === 'encrypt')}>
            <Lock size={12} /> Encrypt
          </button>
          <button onClick={() => setCipherMode('decrypt')} className={TOGGLE_BTN(cipherMode === 'decrypt')}>
            <Unlock size={12} /> Decrypt
          </button>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">Password</label>
            <button
              onClick={genPassword}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150"
            >
              <RefreshCw size={11} /> Generate
            </button>
          </div>
          <input
            type="text"
            className={INPUT_CLS}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password…"
          />
        </div>

        {/* Input format (decrypt only) */}
        {cipherMode === 'decrypt' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-on-surface-muted">Input format:</span>
            <button onClick={() => setInputFormat('base64')} className={TOGGLE_BTN(inputFormat === 'base64')}>Base64</button>
            <button onClick={() => setInputFormat('hex')} className={TOGGLE_BTN(inputFormat === 'hex')}>Hex</button>
          </div>
        )}

        {/* Input */}
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide flex-shrink-0">
          {cipherMode === 'encrypt' ? 'Plaintext' : 'Ciphertext'}
        </span>
        <textarea
          className={TEXTAREA_CLS}
          placeholder={cipherMode === 'encrypt' ? 'Enter text to encrypt…' : 'Paste ciphertext to decrypt…'}
          value={input}
          onChange={e => setInput(e.target.value)}
        />

        <button
          onClick={process}
          disabled={loading || !input || !password}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-text hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {cipherMode === 'encrypt' ? <Lock size={14} /> : <Unlock size={14} />}
          {btnLabel}
        </button>
      </div>

      {/* Right — output */}
      <div className="flex flex-col flex-1 min-w-0 p-4 gap-4 overflow-auto">
        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {cipherMode === 'encrypt' && encResult && (
          <>
            <OutputBlock
              label="Base64"
              value={encResult.base64}
              copyKey="b64"
              copiedKey={copiedKey}
              onCopy={copy}
            />
            <OutputBlock
              label="Hex"
              value={encResult.hex}
              copyKey="hex"
              copiedKey={copiedKey}
              onCopy={copy}
            />
            <p className="text-xs text-on-surface-muted">
              IV prepended · use Base64 format for decrypt by default
            </p>
          </>
        )}

        {cipherMode === 'decrypt' && decResult && (
          <OutputBlock
            label="Plaintext"
            value={decResult}
            copyKey="plain"
            copiedKey={copiedKey}
            onCopy={copy}
          />
        )}

        {!encResult && !decResult && !error && (
          <div className="flex items-center justify-center flex-1 text-sm text-on-surface-muted">
            Set password, enter text, then {cipherMode}
          </div>
        )}
      </div>
    </div>
  )
}

function OutputBlock({
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
  const copied = copiedKey === copyKey
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide">{label}</span>
        <button
          onClick={() => onCopy(value, copyKey)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors duration-150',
            copied ? 'text-accent' : 'text-on-surface-muted hover:text-on-surface',
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={OUTPUT_CLS}>{value}</div>
    </div>
  )
}
