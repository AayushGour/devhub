import type { ReactNode } from 'react'

// Shared inline "code chip" primitive used by SlideDeckGuide.tsx and formatInline
// (guideInlineFormat.tsx) — split into its own file so guideInlineFormat.tsx exports
// only the non-component formatInline function (Fast Refresh requires component-only
// files not mix component and non-component exports).
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-raised border border-border px-1 py-0.5 text-[0.75em] font-mono text-on-surface">
      {children}
    </code>
  )
}
