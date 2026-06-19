import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '../hooks/useRepoChat'

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  function handleSend(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSend(text)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={cn(
      'shrink-0 border-t border-border bg-surface flex flex-col transition-[height] duration-200',
      open ? 'h-72' : 'h-9',
    )}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 w-full"
      >
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        <span>Ask about this repo</span>
        {messages.length > 0 && (
          <span className="ml-auto text-accent">{messages.length} messages</span>
        )}
      </button>

      {open && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2 min-h-0">
            {messages.length === 0 && (
              <p className="text-xs text-on-surface-muted text-center py-4">
                Ask anything about the repository…
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'text-xs rounded-lg px-3 py-2 max-w-[85%]',
                  msg.role === 'user'
                    ? 'bg-accent/10 text-on-surface self-end'
                    : 'bg-surface-raised text-on-surface self-start border border-border',
                )}
              >
                {msg.content || (msg.streaming ? '…' : '')}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-end gap-2 px-4 py-2 border-t border-border shrink-0">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about the codebase…"
              rows={1}
              disabled={disabled}
              className={cn(
                'flex-1 bg-surface-raised border border-border rounded-lg px-3 py-1.5',
                'text-xs text-on-surface placeholder:text-on-surface-muted resize-none',
                'focus:border-accent outline-none transition-colors duration-150',
                'disabled:opacity-50',
              )}
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className={cn(
                'p-1.5 rounded-lg transition-colors duration-150',
                'bg-accent text-accent-text hover:bg-accent-hover',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Send size={12} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
