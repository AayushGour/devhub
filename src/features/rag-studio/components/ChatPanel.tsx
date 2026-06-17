import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import DOMPurify from 'dompurify'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ChatMessage, type RetrievalStage } from '../hooks/useRagEngine'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'

const STAGE_LABELS: Record<RetrievalStage, string> = {
  idle: '',
  expanding: 'Thinking…',
  retrieving: 'Fetching relevant context…',
  generating: 'Generating answer…',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  stage: RetrievalStage
  onSend: (text: string) => void
}

function AiBubble({ msg, stage }: { msg: ChatMessage; stage: RetrievalStage }) {
  const ref = useRef<HTMLDivElement>(null)
  const stageLabel = STAGE_LABELS[stage]
  const showStage = msg.streaming && !msg.content && stageLabel

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = DOMPurify.sanitize(parseMarkdown(msg.content || ' '))
    postProcessPreview(ref.current)
  }, [msg.content])

  if (showStage) {
    return (
      <div className="rag-ai-bubble self-start max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-surface border border-border text-on-surface-muted flex items-center gap-2">
        <span className="inline-flex gap-0.5">
          <span className="animate-bounce [animation-delay:0ms]">·</span>
          <span className="animate-bounce [animation-delay:150ms]">·</span>
          <span className="animate-bounce [animation-delay:300ms]">·</span>
        </span>
        {stageLabel}
      </div>
    )
  }

  return (
    <div className="rag-ai-bubble self-start max-w-[80%] flex flex-col gap-1">
      <div
        className={cn(
          'rounded-xl px-4 py-3 text-sm leading-relaxed',
          'bg-surface border border-border text-on-surface',
          msg.streaming && 'after:content-["▋"] after:animate-pulse after:ml-0.5',
        )}
      >
        <div ref={ref} className="markdown-preview" />
      </div>
      {!msg.streaming && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-on-surface-muted">{formatTime(msg.timestamp)}</span>
          {msg.generationMs != null && (
            <span className="text-[10px] text-on-surface-muted">
              Generated in {formatMs(msg.generationMs)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChatPanel({ messages, disabled, stage, onSend }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-on-surface-muted text-center mt-16 px-6">
            Upload documents on the left, then ask questions here.
          </p>
        )}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="self-end max-w-[80%] flex flex-col gap-1 items-end">
              <div className="rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-surface-raised text-on-surface">
                {msg.content}
              </div>
              <span className="text-[10px] text-on-surface-muted px-1">{formatTime(msg.timestamp)}</span>
            </div>
          ) : (
            <AiBubble key={msg.id} msg={msg} stage={stage} />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 p-4 border-t border-border bg-surface shrink-0"
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask something about your documents… (Enter to send)"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-border bg-surface-raised text-sm text-on-surface placeholder:text-on-surface-muted px-3 py-2 focus:outline-none focus:border-accent transition-colors duration-150 disabled:opacity-50 font-[inherit]"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="self-end flex items-center justify-center w-9 h-9 rounded-lg bg-accent text-accent-text border-none cursor-pointer transition-[background-color,opacity] duration-150 hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
