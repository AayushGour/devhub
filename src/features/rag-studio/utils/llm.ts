import * as webllm from '@mlc-ai/web-llm'

const MODEL_ID = 'Llama-3.2-3B-Instruct-q4f32_1-MLC'

export type LLMProgressCallback = (pct: number, text: string) => void

let _engine: webllm.MLCEngine | null = null
let _loadingPromise: Promise<webllm.MLCEngine> | null = null

export async function getEngine(onProgress?: LLMProgressCallback): Promise<webllm.MLCEngine> {
  if (_engine) return _engine
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = webllm.CreateMLCEngine(MODEL_ID, {
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
    throw err
  })

  return _loadingPromise
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function complete(
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): Promise<string> {
  const engine = await getEngine()
  const reply = await engine.chat.completions.create({
    messages,
    max_tokens: opts.max_tokens ?? 512,
    temperature: 0.1,
  })
  return reply.choices[0]?.message?.content ?? ''
}

export async function* streamComplete(
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
  const engine = await getEngine()
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
