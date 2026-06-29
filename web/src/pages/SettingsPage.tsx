import { useEffect, useState } from 'react'
import { hasModelInCache } from '@mlc-ai/web-llm'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import { CURATED_MODELS, MODEL_FAMILIES, formatVram } from '@/features/rag-studio/utils/models'
import type { Theme } from '@/types'

const themes: { value: Theme; label: string; surface: string; accent: string }[] = [
  { value: 'light', label: 'Light', surface: '#ffffff', accent: '#0066cc' },
  { value: 'dark', label: 'Dark', surface: '#1d1d1f', accent: '#2997ff' },
  { value: 'github', label: 'GitHub', surface: '#0d1117', accent: '#58a6ff' },
  { value: 'nord', label: 'Nord', surface: '#2e3440', accent: '#88c0d0' },
  { value: 'dracula', label: 'Dracula', surface: '#282a36', accent: '#bd93f9' },
]

export default function SettingsPage() {
  const {
    theme, setTheme,
    contextAwareExpansion, setContextAwareExpansion,
    ragLlmModel, setRagLlmModel,
  } = useSettingsStore()

  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all(
      CURATED_MODELS.map(async (m) => {
        const cached = await hasModelInCache(m.id).catch(() => false)
        return cached ? m.id : null
      })
    ).then((results) => {
      if (cancelled) return
      setCachedIds(new Set(results.filter(Boolean) as string[]))
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="max-w-[42.5rem] mx-auto py-8 px-10">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="font-sans text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03rem] text-on-surface mb-2">
          Settings
        </h1>
        <p className="text-[1.06rem] text-on-surface-muted tracking-[-0.02rem] leading-[1.47]">
          Customize your DevHub experience.
        </p>
      </div>

      {/* RAG Studio section */}
      <section className="bg-surface border border-border rounded-[1.12rem] p-6 mb-4">
        <h2 className="text-[1.06rem] font-semibold tracking-[-0.02rem] text-on-surface mb-1">
          RAG Studio
        </h2>
        <p className="text-sm text-on-surface-muted mb-5">
          Controls for retrieval-augmented generation behaviour.
        </p>

        {/* Context-aware expansion toggle */}
        <div className="flex items-center justify-between mb-6">
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
                contextAwareExpansion ? 'left-[1.38rem]' : 'left-0.5',
              )}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-6" />

        {/* Model picker */}
        <div>
          <p className="text-sm font-medium text-on-surface mb-1">Language model</p>
          <p className="text-xs text-on-surface-muted mb-4">
            Downloaded to your browser on first use. Changing model resets the loaded engine. Sizes shown are VRAM required, not download size.
          </p>

          <div className="flex flex-col gap-4">
            {MODEL_FAMILIES.map((family) => {
              const familyModels = CURATED_MODELS.filter((m) => m.family === family)
              return (
                <div key={family}>
                  <p className="text-[0.69rem] font-semibold uppercase tracking-[0.06em] text-on-surface-muted mb-2">
                    {family}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {familyModels.map((model) => {
                      const active = ragLlmModel === model.id
                      return (
                        <button
                          key={model.id}
                          onClick={() => setRagLlmModel(model.id)}
                          className={cn(
                            'flex flex-col items-start gap-1 px-3 py-2.5 rounded-[0.62rem] border-2 bg-transparent cursor-pointer transition-colors duration-150 font-[inherit] text-left',
                            active
                              ? 'border-accent bg-accent/5'
                              : 'border-border hover:border-on-surface-muted',
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              'text-[0.81rem] leading-none tracking-[-0.01rem]',
                              active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface',
                            )}>
                              {model.label}
                            </span>
                            {cachedIds.has(model.id) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Cached" />
                            )}
                          </div>
                          <span className="text-[0.69rem] text-on-surface-muted leading-none">
                            {formatVram(model.vramMB)} VRAM
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Theme section */}
      <section className="bg-surface border border-border rounded-[1.12rem] p-6">
        <h2 className="text-[1.06rem] font-semibold tracking-[-0.02rem] text-on-surface mb-5">
          Appearance
        </h2>

        <div className="flex gap-3 flex-wrap">
          {themes.map(t => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-[0.62rem] rounded-[0.69rem] border-2 bg-transparent cursor-pointer transition-colors duration-150 w-24 font-[inherit]',
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
                'text-xs tracking-[-0.01rem] text-on-surface',
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
