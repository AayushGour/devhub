import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getModelById } from '@/lib/llm/models'
import { useAgentStore, type AgentSession } from '../utils/agentStore'

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const STATUS_DOT: Record<AgentSession['status'], string> = {
  running: 'bg-accent animate-pulse',
  done: 'bg-green-400',
  error: 'bg-red-400',
  stopped: 'bg-on-surface-muted',
}

export default function RunHistory() {
  const sessions = useAgentStore((s) => s.sessions)
  const activeId = useAgentStore((s) => s.activeSessionId)
  const setActiveSession = useAgentStore((s) => s.setActiveSession)
  const deleteSession = useAgentStore((s) => s.deleteSession)
  const clearHistory = useAgentStore((s) => s.clearHistory)

  if (sessions.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[0.65rem] font-semibold text-on-surface-muted uppercase tracking-wider">
          History
        </p>
        <button
          onClick={clearHistory}
          className="text-[0.65rem] text-on-surface-muted hover:text-red-400 transition-colors duration-150"
        >
          Clear all
        </button>
      </div>

      <ul className="space-y-1">
        {sessions.map((sess) => {
          const isActive = sess.id === activeId
          const modelLabel = getModelById(sess.modelId)?.label ?? sess.modelId
          return (
            <li key={sess.id}>
              <div
                className={cn(
                  'group flex items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors duration-150',
                  isActive
                    ? 'border-accent bg-surface-raised'
                    : 'border-transparent hover:border-border hover:bg-surface-hover',
                )}
              >
                <span className={cn('mt-1 w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[sess.status])} />
                <button
                  onClick={() => setActiveSession(sess.id)}
                  className="flex-1 min-w-0 flex flex-col items-start text-left"
                >
                  <span className="text-xs text-on-surface truncate w-full leading-tight">{sess.task}</span>
                  <span className="text-[0.6rem] text-on-surface-muted truncate w-full leading-tight mt-0.5">
                    {modelLabel} · {timeAgo(sess.createdAt)}
                  </span>
                </button>
                <button
                  onClick={() => deleteSession(sess.id)}
                  title="Delete run"
                  aria-label="Delete run"
                  className="shrink-0 text-on-surface-muted hover:text-red-400 transition-colors duration-150 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
