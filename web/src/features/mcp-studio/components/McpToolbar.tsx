import { Plug, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveConnection, useActiveRuntime } from '../store/mcpStudioStore'
import { useMcpConnection } from '../hooks/useMcpConnection'

const BADGE_CLS =
  'text-[0.69rem] font-medium text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5 tracking-[-0.01rem] shrink-0'

export default function McpToolbar() {
  const connection = useActiveConnection()
  const runtime = useActiveRuntime()
  const { disconnect } = useMcpConnection()

  const isConnected = runtime?.status === 'connected'

  return (
    <div className="h-11 flex items-center px-4 gap-[0.62rem] shrink-0 border-b border-border bg-surface">
      <div className="flex items-center gap-1.5 text-on-surface text-[0.81rem] font-semibold tracking-[-0.01rem]">
        <Plug size={15} className="text-accent" />
        MCP Studio
      </div>

      {connection && (
        <>
          <span className="text-on-surface-muted">/</span>
          <span className="text-[0.81rem] text-on-surface truncate max-w-[16rem]">{connection.label}</span>
          <span className={BADGE_CLS}>
            {runtime?.usedTransport === 'sse' ? 'SSE' : runtime?.usedTransport === 'http' ? 'HTTP' : connection.protocol.toUpperCase()}
          </span>
        </>
      )}

      <div className="flex-1" />

      {isConnected && connection && (
        <button
          onClick={() => disconnect(connection.id)}
          className={cn(
            'flex items-center gap-[0.31rem] px-[0.62rem] py-[0.31rem] rounded-[0.44rem] border border-border',
            'bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit]',
            'transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted',
          )}
        >
          <PlugZap size={13} />
          Disconnect
        </button>
      )}
    </div>
  )
}
