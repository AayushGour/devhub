// Shared "not-yet-usable" discovery-state view (loading / error / unsupported /
// empty) for the four capability panels, which otherwise copy-paste this ladder
// with only the noun differing. Returns null once items are loaded and non-empty,
// so a panel can early-return the gate:
//
//   const gate = DiscoveryStateView({ state: runtime.tools, noun: 'tools' })
//   if (gate) return gate
//
// It holds no hooks, so calling it as a plain function for that early return is
// safe; the capitalized name keeps react-refresh happy about the JSX return.

import type { ReactElement } from 'react'
import type { DiscoveryState } from '../types'

interface Props {
  state: DiscoveryState<unknown>
  noun: string
}

export function DiscoveryStateView({ state, noun }: Props): ReactElement | null {
  if (state.status === 'loading') {
    return <div className="p-4 text-xs text-on-surface-muted">Loading {noun}…</div>
  }

  if (state.status === 'error') {
    return (
      <div className="p-4">
        <p className="text-xs text-red-400 font-medium">Error loading {noun}</p>
        <p className="text-[0.65rem] text-on-surface-muted mt-1">{state.error || 'Unknown error'}</p>
      </div>
    )
  }

  if (state.status === 'unsupported') {
    return (
      <div className="p-4 text-xs text-on-surface-muted italic">Server doesn&apos;t advertise {noun}.</div>
    )
  }

  if (state.items.length === 0) {
    return <div className="p-4 text-xs text-on-surface-muted italic">No {noun} available.</div>
  }

  return null
}
