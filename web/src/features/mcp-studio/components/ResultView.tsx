// JSON-RPC result renderer shared by ToolsPanel / PromptsPanel / ResourcesPanel /
// TemplatesPanel: Rendered (markdown) ⇄ Text ⇄ Raw toggle, copy-to-clipboard,
// isError styling. `data` is whatever raw MCP result the caller got back
// (CallToolResult, GetPromptResult, ReadResourceResult) — or a caught-error
// payload — this component doesn't care about the specific shape beyond an
// optional `content: [...]` array of text blocks it can render.

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import MarkdownViewer from '@/components/MarkdownViewer'

export interface ResultViewProps {
  /** The raw result/error payload to render. `null`/`undefined` renders `emptyMessage` instead. */
  data: unknown
  /** Styles the result red (e.g. `CallToolResult.isError` or a caught invoke error). */
  isError?: boolean
  emptyMessage?: string
  className?: string
}

type ViewMode = 'rendered' | 'text' | 'raw'

const TOGGLE_BTN_CLS = 'px-2 py-1 text-[0.65rem] transition-colors duration-150'

function extractContentBlocks(data: unknown): { type: string; text?: string }[] | null {
  if (data && typeof data === 'object' && Array.isArray((data as { content?: unknown }).content)) {
    return (data as { content: { type: string; text?: string }[] }).content
  }
  return null
}

// Best-effort markdown source for the Rendered view: join the text of every text
// block, or the payload itself when it's already a bare string. Returns null when
// there's nothing textual to render (so the Rendered toggle is hidden).
function extractMarkdown(blocks: { type: string; text?: string }[] | null, data: unknown): string | null {
  if (blocks) {
    const texts = blocks.filter((b) => typeof b.text === 'string').map((b) => b.text as string)
    return texts.length ? texts.join('\n\n') : null
  }
  if (typeof data === 'string') return data
  return null
}

export default function ResultView({
  data,
  isError,
  emptyMessage = 'No result yet — run to see output.',
  className,
}: ResultViewProps) {
  const [mode, setMode] = useState<ViewMode>('rendered')
  const [copied, setCopied] = useState(false)

  if (data === null || data === undefined) {
    return <p className={cn('text-[0.65rem] text-on-surface-muted italic', className)}>{emptyMessage}</p>
  }

  const blocks = extractContentBlocks(data)
  const raw = JSON.stringify(data, null, 2)
  // Errors are plain text — don't offer a markdown render for them.
  const markdown = isError ? null : extractMarkdown(blocks, data)
  const canRender = markdown !== null
  const effectiveMode: ViewMode = mode === 'rendered' && !canRender ? 'text' : mode
  const copyText = effectiveMode === 'rendered' && markdown !== null ? markdown : raw

  async function handleCopy() {
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      <div className="flex items-center gap-2 shrink-0 mb-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {canRender && (
            <button
              onClick={() => setMode('rendered')}
              className={cn(TOGGLE_BTN_CLS, effectiveMode === 'rendered' ? 'bg-accent text-accent-text' : 'text-on-surface-muted hover:bg-surface-hover')}
            >
              Rendered
            </button>
          )}
          <button
            onClick={() => setMode('text')}
            className={cn(TOGGLE_BTN_CLS, effectiveMode === 'text' ? 'bg-accent text-accent-text' : 'text-on-surface-muted hover:bg-surface-hover')}
          >
            Text
          </button>
          <button
            onClick={() => setMode('raw')}
            className={cn(TOGGLE_BTN_CLS, effectiveMode === 'raw' ? 'bg-accent text-accent-text' : 'text-on-surface-muted hover:bg-surface-hover')}
          >
            Raw
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[0.65rem] text-on-surface-muted hover:text-on-surface transition-colors duration-150"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {effectiveMode === 'rendered' ? (
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
          <MarkdownViewer content={markdown as string} className="text-sm max-w-none px-4 py-3 mcp-result" />
        </div>
      ) : (
        <div
          className={cn(
            'flex-1 min-h-0 overflow-auto rounded-lg border px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words',
            isError ? 'border-red-400/40 bg-red-400/5 text-red-400' : 'border-border bg-surface-raised text-on-surface',
          )}
        >
          {effectiveMode === 'raw' || !blocks
            ? raw
            : blocks.map((b, i) => (
              <div key={i} className={cn(i > 0 && 'mt-2 pt-2 border-t border-border/50')}>
                {typeof b.text === 'string' ? b.text : JSON.stringify(b, null, 2)}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
