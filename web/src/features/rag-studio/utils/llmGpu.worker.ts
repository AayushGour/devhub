// src/features/rag-studio/utils/llmGpu.worker.ts
//
// WebGPU text-generation (web-llm) runs here, OFF the main thread. web-llm drives
// the GPU and does heavy CPU work (tokenizer, grammar, sampling, and the whole
// model download/cache pipeline); running it on the main thread janked the UI
// during load and generation. `WebWorkerMLCEngineHandler` owns a real MLCEngine
// in this worker and speaks web-llm's RPC protocol; the proxy in `llmGpu.ts`
// creates the matching `WebWorkerMLCEngine` client on the main thread.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'
import { createLogger } from '@/lib/logger'

const log = createLogger('rag:llm:gpu:worker')

// Model shards are fetched HERE now (web-llm runs in this worker), so the
// per-request HTTP logger lives here too. A 429 = rate limited by the host; a
// QuotaExceededError without any failed fetch = browser storage, not the network.
// The shared logger is worker-safe: it wraps localStorage in try/catch and guards
// `window`, so it degrades to default-on inside the worker.
function installFetchLogger(): void {
  const orig = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const relevant =
      /huggingface|hf\.co|raw\.|mlc-ai|cdn|\.wasm|\.bin|params_shard|ndarray-cache|tokenizer/i.test(url)
    if (!relevant) return orig(input, init)
    const t0 = performance.now()
    try {
      const res = await orig(input, init)
      const ms = Math.round(performance.now() - t0)
      log.log(`fetch ${res.ok ? 'ok ' : 'NON-OK'} ${res.status} ${res.statusText} ${ms}ms ${url}`)
      if (!res.ok) {
        log.warn('  ↳ response headers:', Object.fromEntries(res.headers.entries()))
        if (res.status === 429) log.warn('  ↳ ⚠️ HTTP 429 — RATE LIMITED by host')
      }
      return res
    } catch (e) {
      log.error(`fetch FAILED (network error) ${url}`, e)
      throw e
    }
  }
}

installFetchLogger()

// `self` is the worker global; the app tsconfig doesn't pull in the WebWorker lib,
// so narrow it to the member we touch instead of referencing DedicatedWorkerGlobalScope.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
}

// The handler owns the MLCEngine and routes every request (reload, completions,
// interrupt, …) to it. Bind so its method keeps its `this` when called as a
// plain function from `onmessage`.
const handler = new WebWorkerMLCEngineHandler()
ctx.onmessage = (e: MessageEvent) => handler.onmessage(e)
