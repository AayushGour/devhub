import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ChatMessage } from '../hooks/useRagEngine'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
}

function AiBubble({ msg }: { msg: ChatMessage }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = parseMarkdown(msg.content || ' ')
    postProcessPreview(ref.current)
  }, [msg.content])

  return (
    <div
      className={cn(
        'rag-ai-bubble self-start max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed',
        'bg-surface border border-border text-on-surface',
        msg.streaming && 'after:content-["▋"] after:animate-pulse after:ml-0.5',
      )}
    >
      <div ref={ref} className="markdown-preview" />
    </div>
  )
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
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
            <div
              key={msg.id}
              className="self-end max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-surface-raised text-on-surface"
            >
              {msg.content}
            </div>
          ) : (
            <AiBubble key={msg.id} msg={msg} />
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
