import { useState } from 'react'
import { Columns2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextInput } from './components/TextInput'
import { TokenDisplay } from './components/TokenDisplay'
import { TokenStats } from './components/TokenStats'
import { TokenizerSelector } from './components/TokenizerSelector'
import { ComparePanel } from './components/ComparePanel'
import { useTokenizer } from './hooks/useTokenizer'

export default function TokenStudioPage() {
  const [text, setText] = useState('')
  const [primaryId, setPrimaryId] = useState('cl100k_base')
  const [compareId, setCompareId] = useState('o200k_base')
  const [compareMode, setCompareMode] = useState(false)

  const { result, loading, error } = useTokenizer(primaryId, text)

  return (
    <div className="studio-root">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface flex-shrink-0">
        <span className="text-sm font-semibold text-on-surface">Token Studio</span>
        <div className="flex-1" />
        {!compareMode && (
          <TokenizerSelector value={primaryId} onChange={setPrimaryId} />
        )}
        <button
          onClick={() => setCompareMode((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors duration-150',
            compareMode
              ? 'bg-accent text-accent-text border-accent'
              : 'bg-surface-raised border-border text-on-surface-muted hover:border-accent hover:text-on-surface'
          )}
        >
          <Columns2 size={14} />
          Compare
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 min-h-0 gap-5 p-6 overflow-auto">
        <TextInput value={text} onChange={setText} />

        {compareMode ? (
          <ComparePanel
            text={text}
            primaryId={primaryId}
            compareId={compareId}
            onPrimaryChange={setPrimaryId}
            onCompareChange={setCompareId}
          />
        ) : (
          <>
            <TokenStats result={result} text={text} />
            <TokenDisplay result={result} loading={loading} error={error} />
          </>
        )}
      </div>
    </div>
  )
}
