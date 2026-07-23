// Pre-connection status block shown above CapabilityTabs: renders the
// connecting / error / disconnected sub-states for the active connection. Once
// the connection is fully `connected`, the server identity (name/version/
// protocol/instructions) is shown compactly in the CapabilityTabs header via
// `ServerIdentityBar`, so this component renders nothing.

import { Loader2 } from 'lucide-react'
import { useActiveConnection, useActiveRuntime } from '../store/mcpStudioStore'

export default function ServerOverview() {
  const connection = useActiveConnection()
  const runtime = useActiveRuntime()

  if (!connection) {
    return <p className="text-xs text-on-surface-muted">Connect to an MCP server to see its details.</p>
  }

  if (runtime?.status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-xs text-on-surface-muted">
        <Loader2 size={13} className="animate-spin" />
        Connecting to {connection.label}…
      </div>
    )
  }

  if (runtime?.status === 'error') {
    return (
      <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
        {runtime.errorMsg ?? 'Connection failed.'}
      </div>
    )
  }

  if (!runtime || runtime.status !== 'connected' || !runtime.initResult) {
    return (
      <p className="text-xs text-on-surface-muted">
        {connection.label} is disconnected. Reconnect from the rail to view server details.
      </p>
    )
  }

  // Connected: identity now lives in the CapabilityTabs header (ServerIdentityBar).
  return null
}
