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
  opts: { max_tokens?: number; resetFirst?: boolean } = {},
): Promise<LLMResponse> {
  const engine = await getEngine(modelId)
  // resetChat() clears the KV cache and flushes any system message cached from
  // prior RAG/chat calls. Only do it on the FIRST call per agent run — repeated
  // resets on every iteration exhaust WebGPU memory and crash the instance.
  if (opts.resetFirst) await engine.resetChat()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reply = await (engine.chat.completions.create as any)({
    messages: [...messages], // shallow copy — web-llm mutates via unshift(system) for Hermes-2-Pro
    tools,
    tool_choice: 'auto',
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
