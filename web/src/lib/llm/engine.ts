import * as webllm from '@mlc-ai/web-llm'
import { createLogger } from '@/lib/logger'

const log = createLogger('rag:llm')

export type LLMProgressCallback = (pct: number, text: string) => void

// web-llm runs in a dedicated worker (see llmGpu.worker.ts). This module is a
// thin main-thread proxy: `WebWorkerMLCEngine` exposes the exact same interface
// as `MLCEngine` (chat.completions.create, interruptGenerate, …) but forwards
// every call to the engine living in the worker — so the UI never janks during
// model load or token generation.
let _worker: Worker | null = null
let _engine: webllm.WebWorkerMLCEngine | null = null
let _loadingPromise: Promise<webllm.WebWorkerMLCEngine> | null = null
let _loadedModelId: string | null = null

function getWorker(): Worker {
  if (_worker) return _worker
  const w = new Worker(new URL('./llmGpu.worker.ts', import.meta.url), { type: 'module' })
  w.onerror = (e) => log.error('GPU LLM worker error', e.message)
  _worker = w
  return w
}

export function resetEngine(): void {
  // Terminate the worker too — it holds the GPU device + model weights in VRAM.
  if (_worker) {
    _worker.terminate()
    _worker = null
  }
  _engine = null
  _loadingPromise = null
  _loadedModelId = null
}

export async function unloadEngine(): Promise<void> {
  if (_engine) await _engine.unload()
  _engine = null
  _loadingPromise = null
  _loadedModelId = null
}

// Stop the in-flight generation on the loaded engine. web-llm ends the active
// stream/completion; any `streamComplete` loop awaiting it then finishes.
export function interruptGenerate(): void {
  log.log('interruptGenerate')
  _engine?.interruptGenerate()
}


// ---------------------------------------------------------------------------
// Diagnostics — all routed through the shared logger, so they obey the global
// `devhub:debug` toggle (silence with localStorage devhub:debug=off). They
// distinguish the three plausible model-load failures: browser storage quota,
// HTTP rate limiting (429), and everything else.
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / 1024 ** i).toFixed(2)} ${units[i]}`
}

async function logStorage(when: string): Promise<void> {
  try {
    if (!navigator.storage?.estimate) {
      log.log(`storage @ ${when}: navigator.storage.estimate() unavailable`)
      return
    }
    const est = await navigator.storage.estimate()
    const quota = est.quota ?? 0
    const usage = est.usage ?? 0
    const pct = quota ? ((usage / quota) * 100).toFixed(1) : '?'
    // usageDetails is non-standard and absent from the lib's StorageEstimate type.
    const details = (est as StorageEstimate & { usageDetails?: Record<string, number> }).usageDetails ?? {}
    log.log(
      `storage @ ${when}: usage=${fmtBytes(usage)} / quota=${fmtBytes(quota)} ` +
        `(${pct}% used, ${fmtBytes(quota - usage)} free)`,
      details,
    )
  } catch (e) {
    log.warn(`storage @ ${when}: estimate() threw`, e)
  }
}

// NOTE: the per-request HTTP fetch logger now lives in llmGpu.worker.ts, because
// model shards are fetched inside the worker where web-llm runs.

// ---------------------------------------------------------------------------
// Model loading with retry
// ---------------------------------------------------------------------------

// WebLLM resumes from shards already in the cache, so a retry only re-fetches
// the shard(s) that failed — cheap and fast.
const MAX_LOAD_ATTEMPTS = 4

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// A model-shard download that breaks mid-stream (e.g. ERR_HTTP2_PROTOCOL_ERROR
// from the HuggingFace CDN) surfaces as a QuotaExceededError when WebLLM tries
// to cache.put() the aborted response — even with plenty of storage free. These
// failures are transient: a fresh fetch opens a new connection, so we retry.
function isTransientLoadError(err: unknown): boolean {
  const e = err as Error
  const name = e?.name ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  return (
    name === 'QuotaExceededError' ||
    name === 'NetworkError' ||
    name === 'AbortError' ||
    /http2|protocol error|network|failed to fetch|fetch failed|err_|load failed|timeout|connection/.test(msg)
  )
}

function describeLoadError(err: unknown): Error {
  if (isTransientLoadError(err)) {
    return new Error(
      'Model download was interrupted by a network/CDN error and did not finish ' +
        `after ${MAX_LOAD_ATTEMPTS} attempts. Your browser storage is fine — please ` +
        'retry; the download resumes from the shards already fetched.',
    )
  }
  return err instanceof Error ? err : new Error(String(err))
}

async function loadEngineWithRetry(modelId: string, onProgress?: LLMProgressCallback): Promise<webllm.WebWorkerMLCEngine> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt++) {
    const startedAt = performance.now()
    let lastPct = -1
    try {
      log.log(`load attempt ${attempt}/${MAX_LOAD_ATTEMPTS} for "${modelId}"`)
      // Builds the WebWorkerMLCEngine client and reloads `modelId` inside the
      // worker. Reused worker across retries — a transient CDN error leaves the
      // worker alive, and web-llm resumes from shards already cached.
      const engine = await webllm.CreateWebWorkerMLCEngine(getWorker(), modelId, {
        initProgressCallback: (p: webllm.InitProgressReport) => {
          const pct = Math.round(p.progress * 100)
          if (pct !== lastPct) {
            lastPct = pct
            log.log(`progress ${pct}% — ${p.text}`)
          }
          onProgress?.(pct, p.text)
        },
      })
      log.log(`✅ engine ready in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`)
      await logStorage('after load')
      return engine
    } catch (err) {
      lastErr = err
      const e = err as Error
      log.error(`❌ attempt ${attempt}/${MAX_LOAD_ATTEMPTS} FAILED after ${((performance.now() - startedAt) / 1000).toFixed(1)}s — ${e?.name}: ${e?.message}`, err)
      await logStorage('at failure')

      if (attempt < MAX_LOAD_ATTEMPTS && isTransientLoadError(err)) {
        const waitMs = 1500 * attempt
        log.warn(`transient error — retrying in ${waitMs}ms (resumes from cached shards)`)
        onProgress?.(lastPct < 0 ? 0 : lastPct, `Network hiccup — retrying (${attempt + 1}/${MAX_LOAD_ATTEMPTS})…`)
        await delay(waitMs)
        continue
      }
      break
    }
  }
  throw describeLoadError(lastErr)
}

export async function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<webllm.WebWorkerMLCEngine> {
  if (!modelId) throw new Error('getEngine called with empty modelId — check settingsStore ragLlmModel')
  if (_engine && _loadedModelId === modelId) return _engine
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  // Model changed — drop old engine
  if (_loadedModelId !== modelId) {
    _engine = null
    _loadingPromise = null
  }

  log.log(`getEngine: loading "${modelId}"`)
  log.log(
    `env: crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'n/a'}, ` +
      `SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined' ? 'available' : 'MISSING'}, ` +
      `WebGPU=${typeof navigator !== 'undefined' && 'gpu' in navigator ? 'present' : 'MISSING'}`,
  )
  await logStorage('before load')

  _loadedModelId = modelId
  _loadingPromise = loadEngineWithRetry(modelId, onProgress)
    .then((engine) => {
      _engine = engine
      _loadingPromise = null
      return engine
    })
    .catch((err) => {
      _loadingPromise = null
      _loadedModelId = null
      throw err
    })

  return _loadingPromise
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// A single MLCEngine cannot run two generations at once — overlapping
// `chat.completions.create` calls corrupt its tokenizer/grammar bindings
// (e.g. "Expected null or instance of VectorInt"). Serialize every generation
// through this async mutex so concurrent callers (wiki + chat, fast clicks,
// StrictMode double-effects) queue instead of colliding.
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
    const engine = await getEngine(modelId)

    const reply = await engine.chat.completions.create({
      messages,
      max_tokens: opts.max_tokens ?? 512,
      temperature: opts.temperature ?? 0.1,
    })
    return reply.choices[0]?.message?.content ?? ''
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
  try {
    const engine = await getEngine(modelId)

    const stream = await engine.chat.completions.create({
      messages,
      max_tokens: opts.max_tokens ?? 512,
      temperature: 0.1,
      stream: true,
    })
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) yield delta
    }
  } finally {
    release()
  }
}

// --- Agent tool-calling types and function ---

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface LLMResponse {
  content: string | null
  tool_calls: ToolCall[] | null
  finish_reason: 'stop' | 'tool_calls' | 'length'
}

export type AgentMessage =
  | ChatMessage
  | { role: 'tool'; tool_call_id: string; content: string }

export async function callWithTools(
  modelId: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  opts: { max_tokens?: number; resetFirst?: boolean; toolChoice?: 'auto' | 'none' } = {},
): Promise<LLMResponse> {
  const engine = await getEngine(modelId)
  // resetChat() clears the KV cache and flushes any system message cached from
  // prior RAG/chat calls. Only do it on the FIRST call per agent run — repeated
  // resets on every iteration exhaust WebGPU memory and crash the instance.
  if (opts.resetFirst) await engine.resetChat()
  // tool_choice 'none' forces a plain text answer (no tool calls) — used to break
  // weak models out of an endless tool-calling loop and make them synthesize.
  const toolChoice = opts.toolChoice ?? 'auto'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reply = await (engine.chat.completions.create as any)({
    messages: [...messages], // shallow copy — web-llm mutates via unshift(system) for Hermes-2-Pro
    // Omit tools entirely when forcing 'none' — some web-llm builds re-inject the
    // tool grammar whenever `tools` is present, ignoring tool_choice.
    ...(toolChoice === 'none' ? {} : { tools, tool_choice: 'auto' }),
    max_tokens: opts.max_tokens ?? 1024,
    temperature: 0.1,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = reply.choices[0].message as any
  // finish_reason is unreliable across model builds — check tool_calls directly
  const tool_calls: ToolCall[] | null = msg.tool_calls?.length ? msg.tool_calls : null
  return {
    content: msg.content ?? null,
    tool_calls,
    finish_reason: tool_calls ? 'tool_calls' : (reply.choices[0].finish_reason ?? 'stop'),
  }
}
