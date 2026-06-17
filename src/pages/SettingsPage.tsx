import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import type { Theme } from '@/types'

const themes: { value: Theme; label: string; surface: string; accent: string }[] = [
  { value: 'light', label: 'Light', surface: '#ffffff', accent: '#0066cc' },
  { value: 'dark', label: 'Dark', surface: '#1d1d1f', accent: '#2997ff' },
  { value: 'github', label: 'GitHub', surface: '#0d1117', accent: '#58a6ff' },
  { value: 'nord', label: 'Nord', surface: '#2e3440', accent: '#88c0d0' },
  { value: 'dracula', label: 'Dracula', surface: '#282a36', accent: '#bd93f9' },
]

export default function SettingsPage() {
  const { theme, setTheme, contextAwareExpansion, setContextAwareExpansion } = useSettingsStore()

  return (
    <div className="max-w-[680px] mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="font-sans text-[40px] font-semibold leading-[1.1] tracking-[-0.5px] text-on-surface mb-2">
          Settings
        </h1>
        <p className="text-[17px] text-on-surface-muted tracking-[-0.374px] leading-[1.47]">
          Customize your DevHub experience.
        </p>
      </div>

      {/* RAG Studio section */}
      <section className="bg-surface border border-border rounded-[18px] p-6 mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.374px] text-on-surface mb-1">
          RAG Studio
        </h2>
        <p className="text-sm text-on-surface-muted mb-5">
          Controls for retrieval-augmented generation behaviour.
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-on-surface">Context-aware query expansion</p>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Retrieves a seed context first, then uses it to generate more grounded expansion queries. Slightly slower but more accurate.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={contextAwareExpansion}
            onClick={() => setContextAwareExpansion(!contextAwareExpansion)}
            className={cn(
              'relative shrink-0 w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200',
              contextAwareExpansion ? 'bg-accent' : 'bg-border',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-[left] duration-200',
                contextAwareExpansion ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
        </div>
      </section>

      {/* Theme section */}
      <section className="bg-surface border border-border rounded-[18px] p-6">
        <h2 className="text-[17px] font-semibold tracking-[-0.374px] text-on-surface mb-5">
          Appearance
        </h2>

        <div className="flex gap-3 flex-wrap">
          {themes.map(t => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-[10px] rounded-[11px] border-2 bg-transparent cursor-pointer transition-colors duration-150 w-24 font-[inherit]',
                theme === t.value
                  ? 'border-accent'
                  : 'border-border hover:border-on-surface-muted'
              )}
            >
              {/* Preview swatch — colors come from data array, must stay inline */}
              <div
                className="w-full h-12 rounded-lg border border-black/[0.08] relative overflow-hidden"
                style={{ backgroundColor: t.surface }}
              >
                <div
                  className="absolute bottom-2 right-2 w-3 h-3 rounded-full"
                  style={{ backgroundColor: t.accent }}
                />
              </div>
              <span className={cn(
                'text-xs tracking-[-0.12px] text-on-surface',
                theme === t.value ? 'font-semibold' : 'font-normal'
              )}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
