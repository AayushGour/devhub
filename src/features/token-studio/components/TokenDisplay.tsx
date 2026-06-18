import './TokenDisplay.css'
import type { EncodingResult } from '../utils/tokenizers'

const TOKEN_COLORS = [
  'token-color-0',
  'token-color-1',
  'token-color-2',
  'token-color-3',
  'token-color-4',
  'token-color-5',
] as const

interface TokenDisplayProps {
  result: EncodingResult | null
  loading: boolean
  error: string | null
}

export function TokenDisplay({ result, loading, error }: TokenDisplayProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-on-surface-muted">
        <span className="token-spinner" />
        Loading tokenizer…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500 bg-red-500/5 border border-red-500/20 rounded-xl">
        {error}
      </div>
    )
  }

  if (!result || result.tokenIds.length === 0) {
    return (
      <div className="p-4 text-sm text-on-surface-muted italic">
        Token output will appear here.
      </div>
    )
  }

  return (
    <div className="p-4 bg-surface-raised border border-border rounded-xl leading-7 font-mono text-sm text-on-surface break-all">
      {result.tokenTexts.map((text, i) => (
        <span
          key={i}
          className={`token-chip ${TOKEN_COLORS[result.tokenIds[i] % TOKEN_COLORS.length]}`}
          title={`Token ID: ${result.tokenIds[i]}`}
        >
          {text.replace(/ /g, ' ')}
        </span>
      ))}
    </div>
  )
}
