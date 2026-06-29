import { useTokenizer } from '../hooks/useTokenizer'
import { TokenDisplay } from './TokenDisplay'
import { TokenStats } from './TokenStats'
import { TokenizerSelector } from './TokenizerSelector'
import { TOKENIZER_DEFS } from '../utils/tokenizers'

interface ComparePanelProps {
  text: string
  primaryId: string
  compareId: string
  onPrimaryChange: (id: string) => void
  onCompareChange: (id: string) => void
}

export function ComparePanel({
  text,
  primaryId,
  compareId,
  onPrimaryChange,
  onCompareChange,
}: ComparePanelProps) {
  const primary = useTokenizer(primaryId, text)
  const compare = useTokenizer(compareId, text)

  const primaryDef = TOKENIZER_DEFS.find((d) => d.id === primaryId)
  const compareDef = TOKENIZER_DEFS.find((d) => d.id === compareId)

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <ComparePane
        label={primaryDef?.label ?? primaryId}
        tokenizerId={primaryId}
        onTokenizerChange={onPrimaryChange}
        text={text}
        result={primary.result}
        loading={primary.loading}
        error={primary.error}
      />
      <div className="w-px bg-border flex-shrink-0" />
      <ComparePane
        label={compareDef?.label ?? compareId}
        tokenizerId={compareId}
        onTokenizerChange={onCompareChange}
        text={text}
        result={compare.result}
        loading={compare.loading}
        error={compare.error}
      />
    </div>
  )
}

function ComparePane({
  label,
  tokenizerId,
  onTokenizerChange,
  text,
  result,
  loading,
  error,
}: {
  label: string
  tokenizerId: string
  onTokenizerChange: (id: string) => void
  text: string
  result: ReturnType<typeof useTokenizer>['result']
  loading: boolean
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <TokenizerSelector value={tokenizerId} onChange={onTokenizerChange} />
        <span className="text-xs text-on-surface-muted font-medium truncate">{label}</span>
      </div>
      <TokenStats result={result} text={text} />
      <div className="flex-1 overflow-auto">
        <TokenDisplay result={result} loading={loading} error={error} />
      </div>
    </div>
  )
}
