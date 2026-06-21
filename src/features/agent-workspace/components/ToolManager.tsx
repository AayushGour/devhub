import { useState } from 'react'
import { Plus, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '../mcp/mcpStore'
import McpSetupPanel from './McpSetupPanel'

interface BuiltInRow {
  name: string
  description: string
  enabled: boolean
  onToggle: () => void
  setupNote?: string
}

function BuiltInToolRow({ name, description, enabled, onToggle, setupNote }: BuiltInRow) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <button
        onClick={onToggle}
        className={cn(
          'mt-0.5 w-7 h-4 rounded-full shrink-0 transition-colors duration-150 relative',
          enabled ? 'bg-accent' : 'bg-border',
        )}
        aria-label={enabled ? 'Disable' : 'Enable'}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-150',
            enabled ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <div className="min-w-0">
        <p className="text-xs text-on-surface font-medium leading-tight">{name}</p>
        <p className="text-[0.65rem] text-on-surface-muted leading-tight mt-0.5">{description}</p>
        {setupNote && (
          <p className="text-[0.65rem] text-on-surface-muted/70 leading-tight mt-0.5 italic">{setupNote}</p>
        )}
      </div>
    </div>
  )
}

interface Props {
  builtInTools: Array<{
    schema: { function: { name: string; description: string } }
    setupNote?: string
  }>
  enabledBuiltIns: Set<string>
  onToggle: (name: string) => void
}

export default function ToolManager({ builtInTools, enabledBuiltIns, onToggle }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const servers = useMcpStore((s) => s.servers)
  const removeServer = useMcpStore((s) => s.removeServer)
  const reconnect = useMcpStore((s) => s.reconnect)

  return (
    <div className="p-3 space-y-4">
      <div>
        <p className="text-[0.65rem] font-semibold text-on-surface-muted uppercase tracking-wider mb-2">
          Built-in Tools
        </p>
        <div className="divide-y divide-border">
          {builtInTools.map((t) => (
            <BuiltInToolRow
              key={t.schema.function.name}
              name={t.schema.function.name}
              description={t.schema.function.description}
              enabled={enabledBuiltIns.has(t.schema.function.name)}
              onToggle={() => onToggle(t.schema.function.name)}
              setupNote={t.setupNote}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-[0.65rem] font-semibold text-on-surface-muted uppercase tracking-wider mb-2">
          MCP Servers
        </p>

        {servers.length > 0 && (
          <div className="space-y-2 mb-2">
            {servers.map((srv) => (
              <div key={srv.id} className="flex items-start gap-2 py-1.5">
                <div className="mt-0.5 shrink-0">
                  {srv.status === 'connected' && <CheckCircle size={13} className="text-green-400" />}
                  {(srv.status === 'connecting' || srv.status === 'disconnected') && (
                    <Loader2 size={13} className="text-on-surface-muted animate-spin" />
                  )}
                  {srv.status === 'error' && <XCircle size={13} className="text-red-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-on-surface font-medium leading-tight">{srv.name}</p>
                  <p className="text-[0.65rem] text-on-surface-muted leading-tight">{srv.url}</p>
                  {srv.status === 'connected' && srv.tools.length > 0 && (
                    <p className="text-[0.65rem] text-on-surface-muted/70 leading-tight">
                      {srv.tools.length} tool{srv.tools.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                  {(srv.status === 'connecting' || srv.status === 'disconnected') && (
                    <p className="text-[0.65rem] text-on-surface-muted/70 leading-tight">Waiting for server…</p>
                  )}
                  {srv.status === 'error' && srv.errorMsg && (
                    <p className="text-[0.65rem] text-red-400/70 leading-tight truncate">{srv.errorMsg}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {srv.status !== 'connected' && (
                    <button
                      onClick={() => reconnect(srv.id)}
                      title="Retry"
                      className="p-1 rounded text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-150"
                    >
                      <RefreshCw size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => removeServer(srv.id)}
                    title="Remove"
                    className="p-1 rounded text-on-surface-muted hover:text-red-400 hover:bg-surface-hover transition-colors duration-150"
                  >
                    <XCircle size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd ? (
          <McpSetupPanel onClose={() => setShowAdd(false)} />
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150"
          >
            <Plus size={12} />
            Add MCP server
          </button>
        )}
      </div>
    </div>
  )
}
