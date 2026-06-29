import { useState } from 'react'
import { useTokenizer } from '@/features/token-studio/hooks/useTokenizer'
import { TokenStats } from '@/features/token-studio/components/TokenStats'
import { TokenDisplay } from '@/features/token-studio/components/TokenDisplay'

// Offline tiktoken encoders only — the transformers-based tokenizers need network.
const ENCODERS = [
  { id: 'cl100k_base', label: 'cl100k_base · GPT-3.5 / GPT-4' },
  { id: 'o200k_base', label: 'o200k_base · GPT-4o' },
  { id: 'p50k_base', label: 'p50k_base · Codex' },
]

const SELECT_CLS =
  'bg-surface-raised border border-border rounded-md px-2 py-1 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'

export default function TokenView({ text }: { text: string }) {
  const [encoder, setEncoder] = useState('cl100k_base')
  const { result, loading, error } = useTokenizer(encoder, text)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
          Tokenizer
        </span>
        <select
          value={encoder}
          onChange={(e) => setEncoder(e.target.value)}
          className={SELECT_CLS}
        >
          {ENCODERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-auto">
        <div className="shrink-0 px-3 py-2 border-b border-border">
          <TokenStats result={result} text={text} />
        </div>
        <div className="flex-1 min-h-0">
          <TokenDisplay result={result} loading={loading} error={error} />
        </div>
      </div>
    </div>
  )
}
