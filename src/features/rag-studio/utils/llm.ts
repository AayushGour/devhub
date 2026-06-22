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

export async function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<webllm.MLCEngine> {
  if (!modelId) throw new Error('getEngine called with empty modelId — check settingsStore ragLlmModel')
  if (_engine && _loadedModelId === modelId) return _engine
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  // Model changed — drop old engine
  if (_loadedModelId !== modelId) {
    _engine = null
    _loadingPromise = null
  }

  _loadedModelId = modelId
  _loadingPromise = webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (p: webllm.InitProgressReport) => {
      const pct = Math.round(p.progress * 100)
      onProgress?.(pct, p.text)
    },
  }).then((engine) => {
    _engine = engine
    _loadingPromise = null
    return engine
  }).catch((err) => {
    _loadingPromise = null
    _loadedModelId = null
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      throw new Error('Browser cross-origin isolation is not active — SharedArrayBuffer is unavailable. Try a hard refresh (Ctrl+Shift+R) to activate the service worker.')
    }
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
