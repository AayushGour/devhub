import { Plus, CheckCircle, Loader2, XCircle, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStudioStore } from '../store/mcpStudioStore'
import { useMcpConnection } from '../hooks/useMcpConnection'
import type { ConnectionStatus } from '../types'

function StatusIcon({ status }: { status: ConnectionStatus | undefined }) {
  switch (status) {
    case 'connected':
      return <CheckCircle size={13} className="text-green-400" />
    case 'connecting':
      return <Loader2 size={13} className="text-on-surface-muted animate-spin" />
    case 'error':
      return <XCircle size={13} className="text-red-400" />
    default:
      return <span className="w-[13px] h-[13px] rounded-full border border-border shrink-0" />
  }
}

interface Props {
  onNew: () => void
}

export default function ConnectionRail({ onNew }: Props) {
  const connections = useMcpStudioStore((s) => s.connections)
  const runtimes = useMcpStudioStore((s) => s.runtimes)
  const activeConnectionId = useMcpStudioStore((s) => s.activeConnectionId)
  const setActiveConnection = useMcpStudioStore((s) => s.setActiveConnection)
  const { reconnect, removeConnection } = useMcpConnection()

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <button
          onClick={onNew}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border',
            'bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit]',
            'transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted',
          )}
        >
          <Plus size={13} />
          New connection
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {connections.length === 0 && (
          <p className="text-[0.65rem] text-on-surface-muted/70 italic px-1 py-2">No recent servers yet.</p>
        )}
        {connections.map((c) => {
          const runtime = runtimes[c.id]
          const isActive = c.id === activeConnectionId
          return (
            <div
              key={c.id}
              onClick={() => setActiveConnection(c.id)}
              className={cn(
                'group flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors duration-150',
                isActive ? 'bg-surface-raised border border-accent' : 'border border-transparent hover:bg-surface-hover',
              )}
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcon status={runtime?.status} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-on-surface font-medium leading-tight truncate">{c.label}</p>
                <p className="text-[0.65rem] text-on-surface-muted leading-tight truncate">{c.url}</p>
                {runtime?.status === 'error' && runtime.errorMsg && (
                  <p className="text-[0.6rem] text-red-400/70 leading-tight truncate mt-0.5">{runtime.errorMsg}</p>
                )}
              </div>
              <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {runtime?.status !== 'connected' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveConnection(c.id)
                      void reconnect(c.id)
                    }}
                    title="Reconnect"
                    className="p-1 rounded text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-150"
                  >
                    <RefreshCw size={11} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeConnection(c.id) }}
                  title="Remove"
                  className="p-1 rounded text-on-surface-muted hover:text-red-400 hover:bg-surface-hover transition-colors duration-150"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
