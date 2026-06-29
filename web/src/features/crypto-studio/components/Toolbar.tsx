import { cn } from '@/lib/utils'
import { CRYPTO_MODES } from '../utils/constants'
import type { CryptoMode } from '../utils/constants'

interface Props {
  mode: CryptoMode
  onModeChange: (m: CryptoMode) => void
}

export function Toolbar({ mode, onModeChange }: Props) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface flex-shrink-0">
      <span className="text-sm font-semibold text-on-surface">Crypto Studio</span>
      <div className="flex-1" />
      <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg p-1">
        {CRYPTO_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150',
              mode === m.id
                ? 'bg-accent text-accent-text'
                : 'text-on-surface-muted hover:text-on-surface',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
