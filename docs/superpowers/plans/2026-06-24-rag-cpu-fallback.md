# RAG CPU Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CPU/WASM fallback to the RAG Studio LLM pipeline so machines without WebGPU can run the full pipeline using `@xenova/transformers`.

**Architecture:** Split `llm.ts` into `llmGpu.ts` (existing WebLLM code, filename only), `llmCpu.ts` (new `@xenova/transformers` backend), and a new `llm.ts` dispatcher that detects GPU availability once and routes all calls. All call sites (`ingest.ts`, `queryExpansion.ts`, `useRagEngine.ts`) remain untouched.

**Tech Stack:** `@mlc-ai/web-llm` (GPU), `@xenova/transformers` ^2.17 (CPU/WASM, already installed), React, TypeScript, Zustand.

## Global Constraints

- No new npm dependencies — `@xenova/transformers` is already installed.
- GPU path (`llmGpu.ts`) must not be modified in any way beyond renaming the file.
- `npx tsc --noEmit` must pass after every task.
- No `@ts-ignore` or `as any` unless unavoidable; add a comment explaining why.
- Follow Tailwind-first styling from CLAUDE.md — no inline styles except data-driven colors.
- Use `cn()` from `@/lib/utils` for conditional class strings.

---

### Task 1: Extract WebLLM backend to `llmGpu.ts`

**Files:**
- Rename: `src/features/rag-studio/utils/llm.ts` → `src/features/rag-studio/utils/llmGpu.ts`
- Create: `src/features/rag-studio/utils/llm.ts` (stub that re-exports everything from `llmGpu.ts` for now — temporary, replaced in Task 4)

**Interfaces:**
- Produces: `llmGpu.ts` with all existing exports: `resetEngine`, `interruptGenerate`, `getEngine`, `complete`, `streamComplete`, `LLMProgressCallback`, `ChatMessage`

- [ ] **Step 1: Rename `llm.ts` to `llmGpu.ts`**

```bash
mv src/features/rag-studio/utils/llm.ts src/features/rag-studio/utils/llmGpu.ts
```

- [ ] **Step 2: Create temporary `llm.ts` that re-exports everything**

Create `src/features/rag-studio/utils/llm.ts`:

```ts
export {
  resetEngine,
  interruptGenerate,
  getEngine,
  complete,
  streamComplete,
} from './llmGpu'
export type { LLMProgressCallback, ChatMessage } from './llmGpu'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see "cannot find module './llm'", one of the importing files has a cached path issue — check that `llmGpu.ts` exists and `llm.ts` re-exports correctly.

- [ ] **Step 4: Commit**

```bash
git add src/features/rag-studio/utils/llmGpu.ts src/features/rag-studio/utils/llm.ts
git commit -m "refactor(rag): extract WebLLM backend to llmGpu.ts"
```

---

### Task 2: WebGPU detection utility

**Files:**
- Create: `src/features/rag-studio/utils/webgpu.ts`

**Interfaces:**
- Produces: `isWebGpuAvailable(): Promise<boolean>` — cached, safe to call from multiple places.

- [ ] **Step 1: Create `webgpu.ts`**

```ts
// src/features/rag-studio/utils/webgpu.ts
let _cached: Promise<boolean> | null = null

export function isWebGpuAvailable(): Promise<boolean> {
  if (_cached) return _cached
  _cached = (async () => {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
      // requestAdapter() returns null when no compatible GPU is found
      const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
      return adapter !== null
    } catch {
      return false
    }
  })()
  return _cached
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The `GPU` type is from the WebGPU spec — it's available in `lib.dom.d.ts` in TypeScript 4.9+. If you get "Property 'gpu' does not exist on type 'Navigator'", add `/// <reference types="@webgpu/types" />` at the top or cast with `as any` and add a comment: `// navigator.gpu is not in all TS lib versions`.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/webgpu.ts
git commit -m "feat(rag): add WebGPU detection utility"
```

---

### Task 3: CPU model list in `models.ts`

**Files:**
- Modify: `src/features/rag-studio/utils/models.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `CPU_MODELS: ModelEntry[]` — ONNX models loadable by `@xenova/transformers`
  - `DEFAULT_CPU_MODEL_ID: string`
  - `CPU_MODEL_FAMILIES: string[]`
  - `getModelsForEnvironment(gpuAvailable: boolean): ModelEntry[]`

- [ ] **Step 1: Add CPU models and helpers to `models.ts`**

Open `src/features/rag-studio/utils/models.ts` and append after the existing `getModelById` function:

```ts
export const DEFAULT_CPU_MODEL_ID = 'Xenova/Llama-3.2-1B-Instruct'

export const CPU_MODELS: ModelEntry[] = [
  { id: 'Xenova/Llama-3.2-1B-Instruct',   label: 'Llama 3.2 1B',   family: 'Llama',    sizeLabel: '1B',    vramMB: 0 },
  { id: 'Xenova/Qwen2.5-0.5B-Instruct',   label: 'Qwen2.5 0.5B',   family: 'Qwen2.5',  sizeLabel: '0.5B',  vramMB: 0 },
  { id: 'Xenova/Qwen2.5-1.5B-Instruct',   label: 'Qwen2.5 1.5B',   family: 'Qwen2.5',  sizeLabel: '1.5B',  vramMB: 0 },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', label: 'SmolLM2 1.7B', family: 'SmolLM2', sizeLabel: '1.7B', vramMB: 0 },
]

export const CPU_MODEL_FAMILIES = [...new Set(CPU_MODELS.map((m) => m.family))]

export function getModelsForEnvironment(gpuAvailable: boolean): ModelEntry[] {
  return gpuAvailable ? CURATED_MODELS : CPU_MODELS
}
```

Note: `vramMB: 0` for CPU models because VRAM is not relevant — the settings UI will need to hide the VRAM label for CPU models (handled in Task 6).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/models.ts
git commit -m "feat(rag): add CPU model list and getModelsForEnvironment"
```

---

### Task 4: CPU LLM backend `llmCpu.ts`

**Files:**
- Create: `src/features/rag-studio/utils/llmCpu.ts`

**Interfaces:**
- Consumes: `@xenova/transformers` — `pipeline`, `TextStreamer`, `env`
- Produces (identical signatures to `llmGpu.ts`):
  - `resetEngine(): void`
  - `interruptGenerate(): void`
  - `getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<unknown>`
  - `complete(modelId: string, messages: ChatMessage[], opts?): Promise<string>`
  - `streamComplete(modelId: string, messages: ChatMessage[], opts?): AsyncGenerator<string>`
  - `LLMProgressCallback` type (re-exported from `llmGpu.ts`)
  - `ChatMessage` type (re-exported from `llmGpu.ts`)

- [ ] **Step 1: Create `llmCpu.ts`**

```ts
// src/features/rag-studio/utils/llmCpu.ts
import { pipeline, TextStreamer, env } from '@xenova/transformers'
import { createLogger } from '@/lib/logger'
import type { LLMProgressCallback, ChatMessage } from './llmGpu'

export type { LLMProgressCallback, ChatMessage }

// Match the threading config already set by the embedder
env.backends.onnx.wasm.numThreads = 1

const log = createLogger('rag:llm:cpu')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextGenPipeline = any

let _pipe: TextGenPipeline | null = null
let _loadingPromise: Promise<TextGenPipeline> | null = null
let _loadedModelId: string | null = null
let _stopFlag = false

export function resetEngine(): void {
  _pipe = null
  _loadingPromise = null
  _loadedModelId = null
}

export function interruptGenerate(): void {
  log.log('interruptGenerate (CPU)')
  _stopFlag = true
}

export async function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<TextGenPipeline> {
  if (_pipe && _loadedModelId === modelId) return _pipe
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  if (_loadedModelId !== modelId) {
    _pipe = null
    _loadingPromise = null
  }

  log.log(`getEngine: loading CPU model "${modelId}"`)
  _loadedModelId = modelId

  _loadingPromise = pipeline('text-generation', modelId, {
    quantized: true,
    progress_callback: (p: { status: string; progress?: number; file?: string; name?: string }) => {
      if (p.progress !== undefined) {
        onProgress?.(Math.round(p.progress), p.file ?? p.name ?? '')
      }
    },
  })
    .then((pipe) => {
      _pipe = pipe
      _loadingPromise = null
      log.log(`✅ CPU model ready: "${modelId}"`)
      return pipe
    })
    .catch((err) => {
      _loadingPromise = null
      _loadedModelId = null
      throw err
    })

  return _loadingPromise
}

// Apply the model's chat template. Falls back to a plain concatenation if the
// tokenizer does not expose apply_chat_template (older ONNX exports).
function applyTemplate(pipe: TextGenPipeline, messages: ChatMessage[]): string {
  try {
    const tokenizer = pipe.tokenizer
    if (typeof tokenizer?.apply_chat_template === 'function') {
      return tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      }) as string
    }
  } catch (e) {
    log.warn('apply_chat_template failed, using fallback', e)
  }
  // Simple fallback for models without a chat template
  return (
    messages.map((m) => `<|${m.role}|>\n${m.content}`).join('\n') +
    '\n<|assistant|>\n'
  )
}

let _genLock: Promise<void> = Promise.resolve()

function acquireGenLock(): Promise<() => void> {
  let release!: () => void
  const next = new Promise<void>((r) => (release = r))
  const prev = _genLock
  _genLock = prev.then(() => next)
  return prev.then(() => release)
}

export async function complete(
  modelId: string,
  messages: ChatMessage[],
  opts: { max_tokens?: number; temperature?: number } = {},
): Promise<string> {
  const release = await acquireGenLock()
  try {
    const pipe = await getEngine(modelId)
    const prompt = applyTemplate(pipe, messages)
    const result = await pipe(prompt, {
      max_new_tokens: opts.max_tokens ?? 512,
      temperature: opts.temperature ?? 0.1,
      do_sample: (opts.temperature ?? 0.1) > 0,
      return_full_text: false,
    })
    return (result as Array<{ generated_text: string }>)[0]?.generated_text ?? ''
  } finally {
    release()
  }
}

export async function* streamComplete(
  modelId: string,
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
  const release = await acquireGenLock()
  _stopFlag = false
  try {
    const pipe = await getEngine(modelId)
    const prompt = applyTemplate(pipe, messages)

    const tokens: string[] = []
    let generationDone = false
    let wakeup: (() => void) | null = null

    let streamer: unknown
    try {
      streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          tokens.push(text)
          const r = wakeup
          wakeup = null
          r?.()
        },
      })
    } catch {
      // TextStreamer unavailable — fall back to non-streaming (yields full result at end)
      log.warn('TextStreamer unavailable, falling back to non-streaming')
      const result = await complete(modelId, messages, { max_tokens: opts.max_tokens })
      yield result
      return
    }

    const genPromise = pipe(prompt, {
      max_new_tokens: opts.max_tokens ?? 512,
      temperature: 0.1,
      do_sample: true,
      return_full_text: false,
      streamer,
    })
      .then(() => {
        generationDone = true
        const r = wakeup
        wakeup = null
        r?.()
      })
      .catch((err: unknown) => {
        log.error('CPU generation error', err)
        generationDone = true
        const r = wakeup
        wakeup = null
        r?.()
      })

    while (!generationDone || tokens.length > 0) {
      while (tokens.length > 0) {
        if (_stopFlag) {
          generationDone = true
          break
        }
        yield tokens.shift()!
      }
      if (!generationDone && !_stopFlag) {
        await new Promise<void>((r) => {
          wakeup = r
        })
      }
    }

    await genPromise
  } finally {
    release()
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If you get "Module '@xenova/transformers' has no exported member 'TextStreamer'", the try/catch in `streamComplete` already handles runtime absence. For the compile error, change the import to:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { pipeline, TextStreamer, env } = await import('@xenova/transformers') as any
```

But first try the named import — it should work with v2.17.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/llmCpu.ts
git commit -m "feat(rag): add CPU LLM backend using @xenova/transformers"
```

---

### Task 5: Replace `llm.ts` with the dispatcher

**Files:**
- Overwrite: `src/features/rag-studio/utils/llm.ts` (was a re-export stub from Task 1, now becomes the real dispatcher)

**Interfaces:**
- Consumes: `isWebGpuAvailable` from `./webgpu`, `getModelsForEnvironment`, `DEFAULT_MODEL_ID`, `DEFAULT_CPU_MODEL_ID` from `./models`, all exports from `./llmGpu` and `./llmCpu`
- Produces: same public API as before — `resetEngine`, `interruptGenerate`, `getEngine`, `complete`, `streamComplete`, `LLMProgressCallback`, `ChatMessage`

- [ ] **Step 1: Overwrite `llm.ts` with the dispatcher**

```ts
// src/features/rag-studio/utils/llm.ts
import { isWebGpuAvailable } from './webgpu'
import { getModelsForEnvironment, DEFAULT_MODEL_ID, DEFAULT_CPU_MODEL_ID } from './models'
import * as gpu from './llmGpu'
import * as cpu from './llmCpu'

export type { LLMProgressCallback, ChatMessage } from './llmGpu'

let _gpuAvailable: boolean | null = null

async function detectBackend(): Promise<boolean> {
  if (_gpuAvailable === null) _gpuAvailable = await isWebGpuAvailable()
  return _gpuAvailable
}

function resolveModelId(modelId: string, gpuAvailable: boolean): string {
  const models = getModelsForEnvironment(gpuAvailable)
  if (models.some((m) => m.id === modelId)) return modelId
  return gpuAvailable ? DEFAULT_MODEL_ID : DEFAULT_CPU_MODEL_ID
}

export function resetEngine(): void {
  gpu.resetEngine()
  cpu.resetEngine()
}

export function interruptGenerate(): void {
  gpu.interruptGenerate()
  cpu.interruptGenerate()
}

export async function getEngine(modelId: string, onProgress?: gpu.LLMProgressCallback) {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  return gpuAvailable ? gpu.getEngine(id, onProgress) : cpu.getEngine(id, onProgress)
}

export async function complete(
  modelId: string,
  messages: gpu.ChatMessage[],
  opts: { max_tokens?: number; temperature?: number } = {},
): Promise<string> {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  return gpuAvailable ? gpu.complete(id, messages, opts) : cpu.complete(id, messages, opts)
}

export async function* streamComplete(
  modelId: string,
  messages: gpu.ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  const stream = gpuAvailable
    ? gpu.streamComplete(id, messages, opts)
    : cpu.streamComplete(id, messages, opts)
  yield* stream
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. All imports in `settingsStore.ts`, `ingest.ts`, `queryExpansion.ts`, `useRagEngine.ts` still resolve to the same function signatures.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/llm.ts
git commit -m "feat(rag): wire up GPU/CPU dispatcher in llm.ts"
```

---

### Task 6: Surface GPU availability in `useRagEngine` + RAG page banner

**Files:**
- Modify: `src/features/rag-studio/hooks/useRagEngine.ts`
- Modify: `src/features/rag-studio/index.tsx`
- Modify: `src/store/settingsStore.ts`

**Interfaces:**
- Consumes: `isWebGpuAvailable` from `../utils/webgpu`, `DEFAULT_CPU_MODEL_ID` from `../utils/models`
- Produces: `useRagEngine` now returns `gpuAvailable: boolean | null` — `null` while detecting, `true`/`false` after.

- [ ] **Step 1: Update `useRagEngine.ts` to detect GPU and auto-correct stored model**

In `src/features/rag-studio/hooks/useRagEngine.ts`, add the following:

At the top, add imports:
```ts
import { isWebGpuAvailable } from '../utils/webgpu'
import { DEFAULT_CPU_MODEL_ID, getModelsForEnvironment } from '../utils/models'
```

Inside `useRagEngine`, add state and detection after the existing `const` declarations at the top of the hook body:

```ts
const setRagLlmModel = useSettingsStore((s) => s.setRagLlmModel)
const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null)
```

Then in `bootEmbedder`, after `if (embeddingReadyRef.current) return`, add the GPU detection block:

```ts
// Detect GPU once and correct the stored model if it's wrong for this environment
const gpu = await isWebGpuAvailable()
setGpuAvailable(gpu)
const validModels = getModelsForEnvironment(gpu)
if (!validModels.some((m) => m.id === ragLlmModel)) {
  setRagLlmModel(gpu ? DEFAULT_MODEL_ID : DEFAULT_CPU_MODEL_ID)
}
```

(Import `DEFAULT_MODEL_ID` at the top: add it to the existing import from `'../utils/models'`)

At the end of `useRagEngine`, add `gpuAvailable` to the return object:
```ts
return {
  docs,
  messages,
  chatDisabled,
  retrievalStage,
  gpuAvailable,       // ← add this
  bootEmbedder,
  loadPersistedDocs,
  processFiles,
  sendMessage,
  stopGeneration,
  clearDocs,
  removeDoc,
}
```

- [ ] **Step 2: Add CPU mode banner to the RAG page**

In `src/features/rag-studio/index.tsx`, update the component:

```tsx
import { useEffect } from 'react'
import { useRagEngine } from './hooks/useRagEngine'
import RagToolbar from './components/RagToolbar'
import DropZone from './components/DropZone'
import DocList from './components/DocList'
import ChatPanel from './components/ChatPanel'

export default function RagStudioPage() {
  const {
    docs,
    messages,
    chatDisabled,
    retrievalStage,
    gpuAvailable,
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    stopGeneration,
    clearDocs,
    removeDoc,
  } = useRagEngine()

  useEffect(() => {
    bootEmbedder()
    loadPersistedDocs()
  }, [bootEmbedder, loadPersistedDocs])

  return (
    <div className="studio-root">
      <RagToolbar onClearAll={clearDocs} />

      {gpuAvailable === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
          <span className="font-semibold shrink-0">CPU mode</span>
          <span className="text-amber-400/80">No GPU detected — running on CPU via WASM. Responses will be slower than usual.</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 flex flex-col gap-4 p-4 border-r border-border bg-surface overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest mb-3">
              Documents
            </h2>
            <DropZone onFiles={processFiles} />
          </div>
          <DocList docs={docs} onRemove={removeDoc} />
        </aside>

        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            disabled={chatDisabled}
            stage={retrievalStage}
            onSend={sendMessage}
            onStop={stopGeneration}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If `DEFAULT_MODEL_ID` import conflicts, add it alongside `DEFAULT_CPU_MODEL_ID` in the existing models import line.

- [ ] **Step 4: Commit**

```bash
git add src/features/rag-studio/hooks/useRagEngine.ts src/features/rag-studio/index.tsx
git commit -m "feat(rag): expose gpuAvailable from useRagEngine, add CPU mode banner"
```

---

### Task 7: Update Settings page for CPU mode

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `isWebGpuAvailable` from `@/features/rag-studio/utils/webgpu`, `CPU_MODELS`, `CPU_MODEL_FAMILIES`, `getModelsForEnvironment` from `@/features/rag-studio/utils/models`
- Produces: Settings page shows the right model list (GPU or CPU) based on environment; GPU/CPU badge next to the picker label; VRAM column hidden for CPU models.

- [ ] **Step 1: Update `SettingsPage.tsx`**

Replace the full file content with:

```tsx
import { useEffect, useState } from 'react'
import { hasModelInCache } from '@mlc-ai/web-llm'
import { useSettingsStore } from '@/store/settingsStore'
import { cn } from '@/lib/utils'
import {
  CURATED_MODELS,
  CPU_MODELS,
  CPU_MODEL_FAMILIES,
  MODEL_FAMILIES,
  getModelsForEnvironment,
  formatVram,
} from '@/features/rag-studio/utils/models'
import { isWebGpuAvailable } from '@/features/rag-studio/utils/webgpu'
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

  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null)
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    isWebGpuAvailable().then(setGpuAvailable)
  }, [])

  useEffect(() => {
    if (gpuAvailable !== true) return
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
  }, [gpuAvailable])

  const models = gpuAvailable === null ? [] : getModelsForEnvironment(gpuAvailable)
  const families = gpuAvailable ? MODEL_FAMILIES : CPU_MODEL_FAMILIES
  const isCpu = gpuAvailable === false

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
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-on-surface">Language model</p>
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
          <p className="text-xs text-on-surface-muted mb-4">
            {isCpu
              ? 'No GPU detected — using CPU/WASM models. Downloaded to your browser on first use. Responses will be slower than on a GPU machine.'
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(rag): update Settings to show GPU/CPU model list with environment badge"
```

---

## Manual Verification

After all tasks are complete, test both paths:

**GPU path (machine with WebGPU):**
1. Open RAG Studio — no amber banner should appear.
2. Open Settings — badge shows **GPU**, GPU model list shows.
3. Upload a document and chat — existing behavior unchanged.

**CPU path (no GPU or GPU disabled):**

To simulate no-GPU in Chrome: open DevTools → three-dot menu → "More tools" → "Rendering" → under "Emulate GPU" uncheck the relevant WebGPU option. Or test in a VM/machine without GPU.

1. Open RAG Studio — amber "CPU mode" banner appears below toolbar.
2. Open Settings — badge shows **CPU**, CPU model list shows (Llama 3.2 1B selected by default).
3. Upload a small document — ingest proceeds (slower than GPU).
4. Ask a question — response streams in (slower, but token-by-token display works).
5. Check browser console: logs should show `rag:llm:cpu` prefix, not `rag:llm`.
