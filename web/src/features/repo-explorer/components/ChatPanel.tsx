import {
  useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Send, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import MarkdownViewer from '@/components/MarkdownViewer'
import type { ChatMessage } from '../hooks/useRepoChat'
import type { Citation } from '../types'
import './ChatPanel.css'

const MIN_W = 180
const MAX_W = 600
const DEFAULT_W = 288

// Popover geometry (px — these feed getBoundingClientRect math, not CSS classes).
const POPOVER_W = 260
const VIEWPORT_MARGIN = 8
const HOVER_CLOSE_MS = 120

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
  onOpenCitation: (c: Citation) => void
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// Info-icon popover listing a message's retrieval citations, grouped by file.
// Opens on hover (antd-style: stays open while the cursor is inside it) and is
// rendered in a portal — the message list is `overflow-y-auto`, so an absolutely
// positioned panel would be clipped by it.
function MessageCitations({ citations, onOpen }: { citations: Citation[]; onOpen: (c: Citation) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }, [cancelClose])

  // Anchor above the trigger, clamped to the viewport; arrow tracks the trigger.
  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(r.left, window.innerWidth - POPOVER_W - VIEWPORT_MARGIN),
    )
    const arrowLeft = Math.min(Math.max(r.left + r.width / 2 - left, 12), POPOVER_W - 12)
    setPos({ top: r.top - VIEWPORT_MARGIN, left, arrowLeft })
  }, [])

  const show = useCallback(() => { cancelClose(); place(); setOpen(true) }, [cancelClose, place])

  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onEsc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (!triggerRef.current?.contains(n) && !panelRef.current?.contains(n)) setOpen(false)
    }
    // capture: the message list scrolls, not the window
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('keydown', onEsc)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('keydown', onEsc)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place])

  useEffect(() => cancelClose, [cancelClose])

  const groups = useMemo(() => {
    const m = new Map<string, Citation[]>()
    for (const c of citations) {
      const list = m.get(c.path)
      if (list) list.push(c)
      else m.set(c.path, [c])
    }
    return [...m.entries()]
  }, [citations])

  return (
    <>
      <button
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onClick={() => (open ? setOpen(false) : show())}
        className="inline-flex items-center gap-1 text-[0.65rem] text-on-surface-muted hover:text-on-surface transition-colors duration-150"
      >
        <Info size={11} />
        {citations.length} source{citations.length === 1 ? '' : 's'}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{ top: pos.top, left: pos.left }}
          className={cn(
            'fixed z-50 w-[16.25rem] -translate-y-full',
            'rounded-lg border border-border bg-surface-raised shadow-lg',
          )}
        >
          <div className="max-h-[16rem] overflow-y-auto p-1">
            {groups.map(([path, cites]) => (
              <div key={path} className="px-1.5 py-1">
                <div className="text-[0.65rem] font-mono text-on-surface truncate" title={path}>{path}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {cites.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => { onOpen(c); setOpen(false) }}
                      title={`relevance ${(c.score * 100).toFixed(0)}%`}
                      className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-surface-hover text-on-surface-muted hover:bg-accent hover:text-accent-text transition-colors duration-150"
                    >
                      L{c.startLine}-{c.endLine}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* arrow */}
          <span
            style={{ left: pos.arrowLeft }}
            className="absolute -bottom-[0.25rem] w-2 h-2 -translate-x-1/2 rotate-45 bg-surface-raised border-b border-r border-border"
          />
        </div>,
        document.body,
      )}
    </>
  )
}

export default function ChatPanel({ messages, disabled, onSend, onOpenCitation }: Props) {
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
            {msg.role === 'ai' && !msg.streaming
              && ((msg.citations?.length ?? 0) > 0 || msg.durationMs != null) && (
              <div className="mt-1.5 flex items-center gap-2">
                {msg.citations && msg.citations.length > 0 && (
                  <MessageCitations citations={msg.citations} onOpen={onOpenCitation} />
                )}
                {msg.durationMs != null && (
                  <span className="text-[0.65rem] text-on-surface-muted tabular-nums">
                    {formatDuration(msg.durationMs)}
                  </span>
                )}
              </div>
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
