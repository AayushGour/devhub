import * as webllm from '@mlc-ai/web-llm'

export type LLMProgressCallback = (pct: number, text: string) => void

let _engine: webllm.MLCEngine | null = null
let _loadingPromise: Promise<webllm.MLCEngine> | null = null
let _loadedModelId: string | null = null

export function resetEngine(): void {
  _engine = null
  _loadingPromise = null
  _loadedModelId = null
}

// ---------------------------------------------------------------------------
// Diagnostics
// Verbose instrumentation for debugging model-load failures. It distinguishes
// the three plausible causes — browser storage quota, HTTP rate limiting (429),
// and everything else — by logging the real error, storage usage vs. quota at
// each phase, and every model-shard fetch with its HTTP status.
// Set VERBOSE = false to silence (or remove this block) once the issue is found.
// ---------------------------------------------------------------------------
const VERBOSE = true

function log(...args: unknown[]): void {
  if (VERBOSE) console.log('[RAG:llm]', ...args)
}

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / 1024 ** i).toFixed(2)} ${units[i]}`
}

async function logStorage(when: string): Promise<void> {
  if (!VERBOSE) return
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      const quota = est.quota ?? 0
      const usage = est.usage ?? 0
      const pct = quota ? ((usage / quota) * 100).toFixed(1) : '?'
      log(
        `storage @ ${when}: usage=${fmtBytes(usage)} / quota=${fmtBytes(quota)} ` +
          `(${pct}% used, ${fmtBytes(quota - usage)} free)`,
        est.usageDetails ?? {},
      )
    } else {
      log(`storage @ ${when}: navigator.storage.estimate() unavailable`)
    }
  } catch (e) {
    log(`storage @ ${when}: estimate() threw`, e)
  }
}

// Wrap window.fetch once to surface every model-related request + its HTTP
// status. This is what definitively proves or disproves an HTTP rate limit:
// a 429 here = rate limited by the host; a QuotaExceededError without any
// failed fetch = browser storage, not the network.
let _fetchPatched = false
function installFetchLogger(): void {
  if (!VERBOSE || _fetchPatched || typeof window === 'undefined') return
  _fetchPatched = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const relevant =
      /huggingface|hf\.co|raw\.|mlc-ai|cdn|\.wasm|\.bin|params_shard|ndarray-cache|tokenizer/i.test(url)
    if (!relevant) return orig(input, init)
    const t0 = performance.now()
    try {
      const res = await orig(input, init)
      const ms = Math.round(performance.now() - t0)
      log(`fetch ${res.ok ? 'ok ' : 'NON-OK'} ${res.status} ${res.statusText} ${ms}ms ${url}`)
      if (!res.ok) {
        log('  ↳ response headers:', Object.fromEntries(res.headers.entries()))
        if (res.status === 429) log('  ↳ ⚠️ HTTP 429 — RATE LIMITED by host')
      }
      return res
    } catch (e) {
      log(`fetch FAILED (network error) ${url}`, e)
      throw e
    }
  }
}

export async function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<webllm.MLCEngine> {
  if (!modelId) throw new Error('getEngine called with empty modelId — check settingsStore ragLlmModel')
  if (_engine && _loadedModelId === modelId) return _engine
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  // Model changed — drop old engine
  if (_loadedModelId !== modelId) {
    _engine = null
    _loadingPromise = null
  }

  installFetchLogger()
  log(`getEngine: loading "${modelId}"`)
  log(
    `env: crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'n/a'}, ` +
      `SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined' ? 'available' : 'MISSING'}, ` +
      `WebGPU=${typeof navigator !== 'undefined' && 'gpu' in navigator ? 'present' : 'MISSING'}`,
  )
  await logStorage('before load')

  _loadedModelId = modelId
  const startedAt = performance.now()
  let lastPct = -1
  _loadingPromise = webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (p: webllm.InitProgressReport) => {
      const pct = Math.round(p.progress * 100)
      if (pct !== lastPct) {
        lastPct = pct
        log(`progress ${pct}% — ${p.text}`)
      }
      onProgress?.(pct, p.text)
    },
  }).then(async (engine) => {
    _engine = engine
    _loadingPromise = null
    log(`✅ engine ready in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`)
    await logStorage('after load')
    return engine
  }).catch(async (err) => {
    _loadingPromise = null
    _loadedModelId = null
    // Surface the REAL error in full — no rewriting, no guessing the cause.
    const e = err as Error
    log(`❌ model load FAILED after ${((performance.now() - startedAt) / 1000).toFixed(1)}s`)
    log(`  name:    ${e?.name}`)
    log(`  message: ${e?.message}`)
    log(`  stack:   ${e?.stack}`)
    log('  raw error object:', err)
    await logStorage('at failure')
    throw err
  })

  return _loadingPromise
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function complete(
  modelId: string,
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): Promise<string> {
  const engine = await getEngine(modelId)
  const reply = await engine.chat.completions.create({
    messages,
    max_tokens: opts.max_tokens ?? 512,
    temperature: 0.1,
  })
  return reply.choices[0]?.message?.content ?? ''
}

export async function* streamComplete(
  modelId: string,
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
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
}
