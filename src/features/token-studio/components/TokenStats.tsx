import type { EncodingResult } from '../utils/tokenizers'

interface TokenStatsProps {
  result: EncodingResult | null
  text: string
}

export function TokenStats({ result, text }: TokenStatsProps) {
  if (!result || result.tokenIds.length === 0) return null

  const tokenCount = result.tokenIds.length
  const charCount = text.length
  const uniqueCount = new Set(result.tokenIds).size
  const ratio = charCount > 0 ? (charCount / tokenCount).toFixed(1) : '—'

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-on-surface-muted px-1">
      <Stat label="tokens" value={tokenCount.toLocaleString()} accent />
      <Stat label="unique" value={uniqueCount.toLocaleString()} />
      <Stat label="chars/token" value={ratio} />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={accent ? 'text-accent font-semibold text-base' : 'text-on-surface font-medium'}>
        {value}
      </span>
      <span className="text-xs">{label}</span>
    </span>
  )
}
