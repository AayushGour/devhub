import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'
import { useAgentStore, type AgentStep } from '../utils/agentStore'

function partitionSteps(steps: AgentStep[]): { thinking: AgentStep[]; final: AgentStep | null } {
  let finalIdx = -1
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === 'done' || steps[i].type === 'error') {
      finalIdx = i
      break
    }
  }
  if (finalIdx === -1) return { thinking: steps, final: null }
  return { thinking: steps.slice(0, finalIdx), final: steps[finalIdx] }
}

function ThinkingBlock({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false)
  const toolCallCount = steps.filter((s) => s.type === 'call').length

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden self-start max-w-[85%]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 text-left"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>
          Thinking
          {toolCallCount > 0 && (
            <span className="ml-1 text-[0.65rem] opacity-60">
              · {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {steps.map((step, i) => {
            if (step.type === 'compact') {
              return (
                <div key={step.id} className="px-3 py-1.5 text-[0.65rem] text-on-surface-muted text-center border-b border-border last:border-b-0">
                  ↑ earlier context summarised
                </div>
              )
            }

            if (step.type === 'call') {
              const nextStep = steps[i + 1]
              const hasObserve = nextStep?.type === 'observe'
              const preview = `${step.toolName ?? '?'}(${step.content.slice(0, 80)}${step.content.length > 80 ? '…' : ''})`
              return (
                <div key={step.id} className={cn('px-3 py-2 border-b border-border', !hasObserve && 'last:border-b-0')}>
                  <span className="text-accent font-mono text-[0.7rem]">▶ {preview}</span>
                </div>
              )
            }

            if (step.type === 'observe') {
              return (
                <div key={step.id} className="px-3 py-2 bg-surface border-b border-border last:border-b-0">
                  <pre className="text-[0.65rem] text-on-surface-muted whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {step.content.length > 500 ? step.content.slice(0, 500) + '…' : step.content}
                  </pre>
                </div>
              )
            }

            return null
          })}
        </div>
      )}
    </div>
  )
}

function AiAnswer({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = parseMarkdown(content || ' ')
    postProcessPreview(ref.current)
  }, [content])

  return (
    <div className="self-start max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-surface border border-border text-on-surface">
      <div ref={ref} className="markdown-preview" />
    </div>
  )
}

export default function RunInspector() {
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeId = useAgentStore((s) => s.activeSessionId)
  const session = useAgentStore((s) => s.sessions.find((sess) => sess.id === activeId))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.steps.length])

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-on-surface-muted text-xs">
        Enter a task and click Run to start the agent.
      </div>
    )
  }

  const { thinking, final } = partitionSteps(session.steps)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-5 gap-4">
      {/* User task bubble */}
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-accent text-accent-text rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
          {session.task}
        </div>
      </div>

      {/* Thinking block — only when steps exist */}
      {thinking.length > 0 && <ThinkingBlock steps={thinking} />}

      {/* Running indicator — no thinking steps yet */}
      {session.status === 'running' && thinking.length === 0 && !final && (
        <div className="self-start flex items-center gap-1.5 text-xs text-on-surface-muted">
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce [animation-delay:0ms]">·</span>
            <span className="animate-bounce [animation-delay:150ms]">·</span>
            <span className="animate-bounce [animation-delay:300ms]">·</span>
          </span>
          <span>Thinking…</span>
        </div>
      )}

      {/* Running indicator while tool calls in progress */}
      {session.status === 'running' && thinking.length > 0 && !final && (
        <div className="self-start flex items-center gap-1.5 text-xs text-on-surface-muted">
          <span className="animate-pulse">●</span>
          <span>Working…</span>
        </div>
      )}

      {/* Final answer as AI bubble */}
      {final?.type === 'done' && (
        final.content.trim()
          ? <AiAnswer content={final.content} />
          : <div className="self-start rounded-xl px-4 py-3 text-sm text-on-surface-muted bg-surface border border-border italic">
              (no response)
            </div>
      )}

      {/* Error */}
      {final?.type === 'error' && (
        <div className="self-start text-red-400 text-sm font-mono bg-surface-raised border border-red-900/40 rounded-xl px-4 py-3">
          {final.content}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
