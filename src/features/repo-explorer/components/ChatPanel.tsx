import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import MarkdownViewer from '@/components/MarkdownViewer'
import type { ChatMessage } from '../hooks/useRepoChat'
import './ChatPanel.css'

const MIN_W = 180
const MAX_W = 600
const DEFAULT_W = 288

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
  const [width, setWidth] = useState(DEFAULT_W)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.max(MIN_W, Math.min(MAX_W, startWidth.current + delta)))
    }
    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function onResizeStart(e: React.MouseEvent) {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

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
    <div
      className="shrink-0 flex flex-col border-r border-border bg-surface relative"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-accent/40 transition-colors duration-150"
      />
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest">
          Ask about repo
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-on-surface-muted text-center py-6">
            Ask anything about the codebase…
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'text-xs rounded-lg px-3 py-2',
              msg.role === 'user'
                ? 'bg-accent/10 text-on-surface self-end max-w-[85%]'
                : 'bg-surface-raised text-on-surface self-start border border-border max-w-[95%] chat-ai-message',
            )}
          >
            {msg.role === 'user' ? (
              msg.content || (msg.streaming ? '…' : '')
            ) : msg.content ? (
              <MarkdownViewer content={msg.content} className="chat-markdown" />
            ) : (
              <span className="text-on-surface-muted">…</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-end gap-2 px-3 py-3 border-t border-border shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about the codebase…"
          rows={2}
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
            'p-1.5 rounded-lg transition-colors duration-150 self-end',
            'bg-accent text-accent-text hover:bg-accent-hover',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  )
}
