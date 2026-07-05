import { useState, type KeyboardEvent } from 'react'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiagramAIStatus } from '../hooks/useDiagramAI'

interface DiagramAIPromptProps {
  onGenerate: (prompt: string) => void
  isGenerating: boolean
  status: DiagramAIStatus
  error: string | null
}

const STATUS_LABEL: Record<DiagramAIStatus, string> = {
  idle: '',
  thinking: 'Thinking…',
  generating: 'Generating…',
}

export default function DiagramAIPrompt({ onGenerate, isGenerating, status, error }: DiagramAIPromptProps) {
  const [input, setInput] = useState('')

  function handleSubmit() {
    const text = input.trim()
    if (!text || isGenerating) return
    setInput('')
    onGenerate(text)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Generate diagram using AI…"
          disabled={isGenerating}
          className={cn(
            'flex-1 bg-surface-raised border border-border rounded-lg px-3 py-1.5',
            'text-xs text-on-surface placeholder:text-on-surface-muted',
            'focus:border-accent outline-none transition-colors duration-150',
            'disabled:opacity-50',
          )}
        />
        {isGenerating && (
          <span className="text-xs text-on-surface-muted shrink-0">{STATUS_LABEL[status]}</span>
        )}
        <button
          onClick={handleSubmit}
          disabled={isGenerating || !input.trim()}
          className={cn(
            'p-1.5 rounded-lg transition-colors duration-150 shrink-0',
            'bg-accent text-accent-text hover:bg-accent-hover',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {isGenerating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Send size={12} />
          )}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-400 truncate">{error}</p>
      )}
    </div>
  )
}
