import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentStore, type AgentStep } from '../utils/agentStore'

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="font-family:monospace">$1</code>')
    .replace(/\n/g, '<br>')
}

interface StepRowProps {
  step: AgentStep
}

function StepRow({ step }: StepRowProps) {
  const [expanded, setExpanded] = useState(false)

  if (step.type === 'compact') {
    return (
      <div className="text-on-surface-muted text-[0.65rem] text-center border-y border-border py-1 my-1">
        ↑ earlier context summarised
      </div>
    )
  }

  if (step.type === 'done') {
    return (
      <div
        className="text-on-surface text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(step.content) }}
      />
    )
  }

  if (step.type === 'error') {
    return <div className="text-red-400 text-xs font-mono">{step.content}</div>
  }

  if (step.type === 'call') {
    const preview = `${step.toolName ?? '?'}(${step.content.slice(0, 60)}${step.content.length > 60 ? '…' : ''})`
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-accent font-mono text-xs hover:opacity-80 transition-opacity"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span>▶ {preview}</span>
        </button>
        {expanded && (
          <pre className="mt-1 ml-4 text-[0.65rem] text-on-surface-muted whitespace-pre-wrap break-all bg-surface-raised rounded px-2 py-1">
            {step.content}
          </pre>
        )}
      </div>
    )
  }

  if (step.type === 'observe') {
    const truncated = step.content.length > 300
    const display = truncated && !expanded ? step.content.slice(0, 300) + '…' : step.content
    return (
      <div className="text-on-surface-muted text-xs">
        <span>{display}</span>
        {truncated && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-accent text-[0.65rem] hover:underline"
          >
            {expanded ? 'show less' : 'show more'}
          </button>
        )}
      </div>
    )
  }

  return null
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

  const statusColor: Record<string, string> = {
    running: 'text-accent',
    done: 'text-green-400',
    error: 'text-red-400',
    stopped: 'text-on-surface-muted',
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
      <div className="flex items-baseline gap-2 mb-4">
        <span className={cn('text-[0.65rem] font-medium uppercase tracking-wide', statusColor[session.status])}>
          {session.status}
        </span>
        <span className="text-xs text-on-surface-muted truncate">{session.task}</span>
      </div>

      {session.steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}

      {session.status === 'running' && (
        <div className="flex items-center gap-1.5 text-xs text-on-surface-muted">
          <span className="animate-pulse">●</span>
          <span>thinking…</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
