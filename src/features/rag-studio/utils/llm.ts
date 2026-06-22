import * as webllm from '@mlc-ai/web-llm'
import { createLogger } from '@/lib/logger'

const log = createLogger('rag:llm')

async function logStorage(when: string): Promise<void> {
  try {
    const est = await navigator.storage?.estimate?.()
    if (!est) return
    const gb = (n = 0) => `${(n / 1e9).toFixed(2)}GB`
    log.log(`storage @ ${when}: ${gb(est.usage)} / ${gb(est.quota)} used`)
  } catch {
    // estimate() unavailable — ignore
  }
}

export type LLMProgressCallback = (pct: number, text: string) => void

let _engine: webllm.MLCEngine | null = null
let _loadingPromise: Promise<webllm.MLCEngine> | null = null
let _loadedModelId: string | null = null

export function resetEngine(): void {
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

export async function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<webllm.MLCEngine> {
  if (!modelId) throw new Error('getEngine called with empty modelId — check settingsStore ragLlmModel')
  if (_engine && _loadedModelId === modelId) return _engine
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  // Model changed — drop old engine
  if (_loadedModelId !== modelId) {
    _engine = null
    _loadingPromise = null
  }

  log.log(`loading model "${modelId}"`)
  await logStorage('before load')
  const done = log.time(`model loaded "${modelId}"`)

  _loadedModelId = modelId
  _loadingPromise = webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (p: webllm.InitProgressReport) => {
      const pct = Math.round(p.progress * 100)
      onProgress?.(pct, p.text)
    },
  }).then((engine) => {
    _engine = engine
    _loadingPromise = null
    done()
    return engine
  }).catch(async (err) => {
    _loadingPromise = null
    _loadedModelId = null
    const e = err as Error
    log.error(`model load FAILED "${modelId}": ${e?.name}: ${e?.message}`, err)
    await logStorage('at failure')
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
