import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToolPageLayoutProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export default function ToolPageLayout({
  title,
  description,
  actions,
  children,
  className,
}: ToolPageLayoutProps) {
  return (
    <div className={cn('flex flex-col h-full max-w-5xl mx-auto w-full', className)}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-on-surface">{title}</h1>
          {description && (
            <p className="text-base text-on-surface-muted mt-2">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 mt-1">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
