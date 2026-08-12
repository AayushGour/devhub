import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X, TriangleAlert, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpConnection } from '../hooks/useMcpConnection'
import { McpConnectError } from '../types'
import type { Protocol, AuthMode, CustomHeaderRow } from '../types'
import { FIELD_INPUT_CLS as INPUT_CLS, FIELD_LABEL_CLS as LABEL_CLS } from '../styles'

const PROTOCOL_OPTIONS: { value: Protocol; label: string }[] = [
  { value: 'auto', label: 'Auto (HTTP → SSE fallback)' },
  { value: 'http', label: 'Streamable HTTP' },
  { value: 'sse', label: 'HTTP+SSE (legacy)' },
]

const AUTH_MODE_OPTIONS: { value: AuthMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer token' },
]

function deriveLabel(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

interface Props {
  onConnected?: (id: string) => void
}

export default function ConnectionForm({ onConnected }: Props) {
  const { connect } = useMcpConnection()

  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('auto')
  const [authMode, setAuthMode] = useState<AuthMode>('none')
  const [token, setToken] = useState('')
  const [customHeaders, setCustomHeaders] = useState<CustomHeaderRow[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<McpConnectError | null>(null)

  const hasAuth = authMode === 'bearer' && token.trim().length > 0
  const hasCustomHeaders = customHeaders.some((h) => h.key.trim())
  const showSseAuthWarning = protocol !== 'http' && (hasAuth || hasCustomHeaders)

  function addHeaderRow() {
    setCustomHeaders((prev) => [...prev, { key: '', value: '' }])
  }
  function updateHeaderRow(i: number, patch: Partial<CustomHeaderRow>) {
    setCustomHeaders((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function removeHeaderRow(i: number) {
    setCustomHeaders((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    try {
      const id = await connect({
        label: label.trim() || deriveLabel(trimmedUrl),
        url: trimmedUrl,
        protocol,
        // Only carry the token when Bearer is actually selected — otherwise a
        // secret typed then switched away from stays in state and would be
        // persisted to localStorage in plaintext under a `none` auth mode.
        auth: { mode: authMode, token: authMode === 'bearer' ? token : '' },
        headers: customHeaders.filter((h) => h.key.trim()),
      })
      onConnected?.(id)
    } catch (err) {
      setError(
        err instanceof McpConnectError
          ? err
          : new McpConnectError('unknown', err instanceof Error ? err.message : String(err)),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[28rem] p-4 space-y-4">
      <p className="text-xs font-medium text-on-surface">Connect to an MCP server</p>

      <div className="space-y-2">
        <div>
          <label className={LABEL_CLS}>Server URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            className={cn(INPUT_CLS, 'mt-0.5')}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>
            Label <span className="opacity-50">(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={url ? deriveLabel(url) : 'My MCP server'}
            className={cn(INPUT_CLS, 'mt-0.5')}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Protocol</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as Protocol)}
            className={cn(INPUT_CLS, 'mt-0.5 cursor-pointer')}
          >
            {PROTOCOL_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <label className={LABEL_CLS}>Auth</label>
          <select
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as AuthMode)}
            className={cn(INPUT_CLS, 'mt-0.5 cursor-pointer')}
          >
            {AUTH_MODE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        {authMode === 'bearer' && (
          <div>
            <label className={LABEL_CLS}>Bearer token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="token"
              className={cn(INPUT_CLS, 'mt-0.5')}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>Custom headers</label>
            <button
              type="button"
              onClick={addHeaderRow}
              className="flex items-center gap-0.5 text-[0.65rem] text-accent hover:opacity-80 transition-opacity"
            >
              <Plus size={10} /> Add header
            </button>
          </div>
          {customHeaders.length > 0 && (
            <div className="mt-1 space-y-1.5">
              {customHeaders.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateHeaderRow(i, { key: e.target.value })}
                    placeholder="Header-Name"
                    className={cn(INPUT_CLS, 'flex-1')}
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateHeaderRow(i, { value: e.target.value })}
                    placeholder="value"
                    className={cn(INPUT_CLS, 'flex-1')}
                  />
                  <button
                    type="button"
                    onClick={() => removeHeaderRow(i)}
                    className="p-1 rounded text-on-surface-muted hover:text-red-400 hover:bg-surface-hover transition-colors duration-150 shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showSseAuthWarning && (
        <div className="flex gap-1.5 text-[0.65rem] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-lg px-2.5 py-2">
          <TriangleAlert size={12} className="shrink-0 mt-0.5" />
          <p>
            Native SSE can&apos;t send request headers. The bearer token will ride as a{' '}
            <span className="font-mono">?access_token=</span> query param; custom headers won&apos;t reach the SSE
            handshake at all. Prefer Streamable HTTP for authed servers.
          </p>
        </div>
      )}

      <p className="text-[0.65rem] text-on-surface-muted/70">
        Connection details, including any token or custom headers, are stored in plaintext in this browser&apos;s
        localStorage.
      </p>

      {error && (
        <div className="text-[0.65rem] text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-2.5 py-2">
          {error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={!url.trim() || isSubmitting}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150',
          url.trim() && !isSubmitting
            ? 'bg-accent text-accent-text hover:bg-accent-hover'
            : 'bg-surface text-on-surface-muted cursor-not-allowed',
        )}
      >
        {isSubmitting && <Loader2 size={12} className="animate-spin" />}
        {isSubmitting ? 'Connecting…' : 'Connect'}
      </button>
    </form>
  )
}
