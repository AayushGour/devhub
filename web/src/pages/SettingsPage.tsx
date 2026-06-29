import { useEffect, useState, useCallback } from 'react'
import { hasModelInCache, deleteModelAllInfoInCache } from '@mlc-ai/web-llm'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import {
  CURATED_MODELS,
  CPU_MODEL_FAMILIES,
  MODEL_FAMILIES,
  getModelsForEnvironment,
  formatVram,
} from '@/features/rag-studio/utils/models'
import { isWebGpuAvailable } from '@/features/rag-studio/utils/webgpu'
import { listRepos, deleteRepo } from '@/features/repo-explorer/utils/repoDb'
import { getSourceFiles, countNodes, clearAll as clearRagVectors } from '@/features/rag-studio/utils/vectorDb'
import { getAllMemoryKeys, clearAllMemory } from '@/features/agent-workspace/tools/memory'
import type { Theme } from '@/types'
import type { RepoMeta } from '@/features/repo-explorer/types'

type Tab = 'models' | 'rag' | 'cache' | 'appearance'

const themes: { value: Theme; label: string; surface: string; accent: string }[] = [
  { value: 'light', label: 'Light', surface: '#ffffff', accent: '#0066cc' },
  { value: 'dark', label: 'Dark', surface: '#1d1d1f', accent: '#2997ff' },
  { value: 'github', label: 'GitHub', surface: '#0d1117', accent: '#58a6ff' },
  { value: 'nord', label: 'Nord', surface: '#2e3440', accent: '#88c0d0' },
  { value: 'dracula', label: 'Dracula', surface: '#282a36', accent: '#bd93f9' },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'models', label: 'Models' },
  { id: 'rag', label: 'RAG Studio' },
  { id: 'cache', label: 'Cached Data' },
  { id: 'appearance', label: 'Appearance' },
]

export default function SettingsPage() {
  const {
    theme, setTheme,
    contextAwareExpansion, setContextAwareExpansion,
    ragLlmModel, setRagLlmModel,
  } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<Tab>('models')
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null)
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set())
  const [repos, setRepos] = useState<RepoMeta[]>([])
  const [ragSources, setRagSources] = useState<string[]>([])
  const [ragChunks, setRagChunks] = useState(0)
  const [memoryKeys, setMemoryKeys] = useState<string[]>([])
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    isWebGpuAvailable().then(setGpuAvailable)
  }, [])

  const loadLlmCache = useCallback(async () => {
    const results = await Promise.all(
      CURATED_MODELS.map(async (m) => {
        const cached = await hasModelInCache(m.id).catch(() => false)
        return cached ? m.id : null
      })
    )
    setCachedIds(new Set(results.filter(Boolean) as string[]))
  }, [])

  const loadStorageData = useCallback(async () => {
    const [repoList, sources, chunks, keys] = await Promise.all([
      listRepos().catch(() => [] as RepoMeta[]),
      getSourceFiles().catch(() => [] as string[]),
      countNodes().catch(() => 0),
      getAllMemoryKeys().catch(() => [] as string[]),
    ])
    setRepos(repoList)
    setRagSources(sources)
    setRagChunks(chunks)
    setMemoryKeys(keys)
  }, [])

  useEffect(() => {
    loadLlmCache()
    loadStorageData()
  }, [loadLlmCache, loadStorageData])

  async function handleDelete(key: string, action: () => Promise<void>) {
    if (confirmKey !== key) { setConfirmKey(key); return }
    setDeleting(true)
    try {
      await action()
      setConfirmKey(null)
      await loadLlmCache()
      await loadStorageData()
    } finally {
      setDeleting(false)
    }
  }

  const anyStorage = repos.length > 0 || ragChunks > 0 || memoryKeys.length > 0 || cachedIds.size > 0
  const models = gpuAvailable === null ? [] : getModelsForEnvironment(gpuAvailable)
  const families = gpuAvailable === false ? CPU_MODEL_FAMILIES : MODEL_FAMILIES
  const isCpu = gpuAvailable === false

  return (
    <div className="max-w-[42.5rem] mx-auto py-8 px-10">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="font-sans text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03rem] text-on-surface mb-2">
          Settings
        </h1>
        <p className="text-[1.06rem] text-on-surface-muted tracking-[-0.02rem] leading-[1.47]">
          Customize your DevHub experience.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setConfirmKey(null) }}
            className={cn(
              'px-4 py-2 text-sm font-medium tracking-[-0.01rem] border-none bg-transparent cursor-pointer font-[inherit] transition-colors duration-150 border-b-2 -mb-px',
              activeTab === tab.id
                ? 'text-on-surface border-accent'
                : 'text-on-surface-muted border-transparent hover:text-on-surface'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Models tab */}
      {activeTab === 'models' && (
        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-border rounded-[1.12rem] p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[1.06rem] font-semibold tracking-[-0.02rem] text-on-surface">
                Language Model
              </h2>
              {gpuAvailable !== null && (
                <span className={cn(
                  'text-[0.62rem] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-md',
                  isCpu
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-accent/15 text-accent',
                )}>
                  {isCpu ? 'CPU' : 'GPU'}
                </span>
              )}
            </div>
            <p className="text-xs text-on-surface-muted mb-5">
              {isCpu
                ? 'No GPU detected — using CPU/WASM models. Responses will be slower than on a GPU machine.'
                : 'Downloaded to your browser on first use. Changing model resets the loaded engine. Sizes shown are VRAM required, not download size.'}
            </p>

            {gpuAvailable === null ? (
              <p className="text-xs text-on-surface-muted">Detecting environment…</p>
            ) : (
              <div className="flex flex-col gap-4">
                {families.map((family) => {
                  const familyModels = models.filter((m) => m.family === family)
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
                              {!isCpu && (
                                <span className="text-[0.69rem] text-on-surface-muted leading-none">
                                  {formatVram(model.vramMB)} VRAM
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* RAG Studio tab */}
      {activeTab === 'rag' && (
        <section className="bg-surface border border-border rounded-[1.12rem] p-6">
          <h2 className="text-[1.06rem] font-semibold tracking-[-0.02rem] text-on-surface mb-1">
            RAG Studio
          </h2>
          <p className="text-sm text-on-surface-muted mb-5">
            Controls for retrieval-augmented generation behaviour.
          </p>

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
        </section>
      )}

      {/* Appearance tab */}
      {activeTab === 'appearance' && (
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
      )}

      {/* Cached Data tab */}
      {activeTab === 'cache' && (
        <section className="bg-surface border border-border rounded-[1.12rem] p-6">
          <h2 className="text-[1.06rem] font-semibold tracking-[-0.02rem] text-on-surface mb-1">
            Cached Data
          </h2>
          <p className="text-sm text-on-surface-muted mb-5">
            Browser storage used by DevHub features. Deleting is permanent.
          </p>

          {!anyStorage && (
            <p className="text-sm text-on-surface-muted">No cached data found.</p>
          )}

          <div className="flex flex-col gap-5">
            {/* LLM Models */}
            {cachedIds.size > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-on-surface-muted mb-2">LLM Models</p>
                <div className="flex flex-col gap-1">
                  {CURATED_MODELS.filter(m => cachedIds.has(m.id)).map(model => {
                    const ck = `llm-${model.id}`
                    const isPending = confirmKey === ck
                    return (
                      <div key={model.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-raised">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          <span className="text-sm text-on-surface">{model.label}</span>
                          <span className="text-xs text-on-surface-muted">{formatVram(model.vramMB)} VRAM</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPending && (
                            <button
                              onClick={() => setConfirmKey(null)}
                              className="text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 font-[inherit] bg-transparent border-none cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            disabled={deleting}
                            onClick={() => handleDelete(ck, () => deleteModelAllInfoInCache(model.id))}
                            className={cn(
                              'text-xs font-medium px-2.5 py-1 rounded-md border-none cursor-pointer font-[inherit] transition-colors duration-150',
                              isPending
                                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                : 'bg-surface-hover text-on-surface-muted hover:text-on-surface'
                            )}
                          >
                            {isPending ? 'Confirm delete' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* RAG Studio */}
            {ragChunks > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-on-surface-muted">RAG Studio</p>
                  <div className="flex items-center gap-2">
                    {confirmKey === 'rag-all' && (
                      <button
                        onClick={() => setConfirmKey(null)}
                        className="text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 font-[inherit] bg-transparent border-none cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      disabled={deleting}
                      onClick={() => handleDelete('rag-all', clearRagVectors)}
                      className={cn(
                        'text-xs font-medium px-2.5 py-1 rounded-md border-none cursor-pointer font-[inherit] transition-colors duration-150',
                        confirmKey === 'rag-all'
                          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                          : 'bg-surface-hover text-on-surface-muted hover:text-on-surface'
                      )}
                    >
                      {confirmKey === 'rag-all' ? 'Confirm clear' : 'Clear all'}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-raised px-3 py-2.5 flex flex-col gap-1">
                  <p className="text-sm text-on-surface">
                    {ragChunks} chunk{ragChunks !== 1 ? 's' : ''} across {ragSources.length} file{ragSources.length !== 1 ? 's' : ''}
                  </p>
                  {ragSources.length > 0 && (
                    <p className="text-xs text-on-surface-muted leading-relaxed">
                      {ragSources.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Repo Explorer */}
            {repos.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-on-surface-muted mb-2">Repo Explorer</p>
                <div className="flex flex-col gap-1">
                  {repos.map(repo => {
                    const ck = `repo-${repo.owner}/${repo.repo}`
                    const isPending = confirmKey === ck
                    return (
                      <div key={ck} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-surface-raised">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-on-surface font-medium">{repo.owner}/{repo.repo}</span>
                          <span className="text-xs text-on-surface-muted">
                            {repo.fileCount} files · indexed {new Date(repo.fetchedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPending && (
                            <button
                              onClick={() => setConfirmKey(null)}
                              className="text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 font-[inherit] bg-transparent border-none cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            disabled={deleting}
                            onClick={() => handleDelete(ck, () => deleteRepo(repo.owner, repo.repo))}
                            className={cn(
                              'text-xs font-medium px-2.5 py-1 rounded-md border-none cursor-pointer font-[inherit] transition-colors duration-150',
                              isPending
                                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                : 'bg-surface-hover text-on-surface-muted hover:text-on-surface'
                            )}
                          >
                            {isPending ? 'Confirm delete' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Agent Memory */}
            {memoryKeys.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Agent Memory</p>
                  <div className="flex items-center gap-2">
                    {confirmKey === 'memory-all' && (
                      <button
                        onClick={() => setConfirmKey(null)}
                        className="text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 font-[inherit] bg-transparent border-none cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      disabled={deleting}
                      onClick={() => handleDelete('memory-all', clearAllMemory)}
                      className={cn(
                        'text-xs font-medium px-2.5 py-1 rounded-md border-none cursor-pointer font-[inherit] transition-colors duration-150',
                        confirmKey === 'memory-all'
                          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                          : 'bg-surface-hover text-on-surface-muted hover:text-on-surface'
                      )}
                    >
                      {confirmKey === 'memory-all' ? 'Confirm clear' : 'Clear all'}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg bg-surface-raised px-3 py-2.5 flex flex-col gap-1">
                  <p className="text-sm text-on-surface">
                    {memoryKeys.length} key{memoryKeys.length !== 1 ? 's' : ''} stored
                  </p>
                  <p className="text-xs text-on-surface-muted leading-relaxed">
                    {memoryKeys.join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
