// src/features/rag-studio/utils/llmCpu.worker.ts
//
// CPU text-generation runs here, OFF the main thread. transformers.js ONNX-WASM
// inference is one long synchronous call that pins whatever thread it runs on;
// keeping it in the worker means the page stays responsive (no frozen tab) while
// a CPU-only machine decodes tokens. Tokens stream back to the main thread via
// postMessage. The proxy in `llmCpu.ts` speaks this protocol.
import { pipeline, TextStreamer, InterruptableStoppingCriteria, env } from '@huggingface/transformers'

// Match the threading config used by the embedder — multi-threading spawns blob
// workers that break in minified production builds.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface GenOpts {
  max_tokens?: number
  temperature?: number
}

// @huggingface/transformers ships incomplete types for the pipeline instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextGenPipeline = any

type InMsg =
  | { type: 'load'; id: number; modelId: string }
  | { type: 'generate'; id: number; modelId: string; messages: ChatMessage[]; opts: GenOpts; stream: boolean }
  | { type: 'interrupt' }
  | { type: 'reset' }

// `self` is the worker global; the app tsconfig doesn't pull in the WebWorker lib,
// so narrow it to the two members we touch instead of referencing DedicatedWorkerGlobalScope.
const ctx = self as unknown as {
  postMessage: (msg: unknown) => void
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
}

function post(msg: unknown): void {
  ctx.postMessage(msg)
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

let _pipe: TextGenPipeline | null = null
let _loadingPromise: Promise<TextGenPipeline> | null = null
let _loadedModelId: string | null = null
// Set per generation so an `interrupt` message can stop the in-flight decode.
let _stopper: InterruptableStoppingCriteria | null = null

async function getEngine(modelId: string, id: number): Promise<TextGenPipeline> {
  if (_pipe && _loadedModelId === modelId) return _pipe
  if (_loadingPromise && _loadedModelId === modelId) return _loadingPromise

  if (_loadedModelId !== modelId) {
    _pipe = null
    _loadingPromise = null
  }
  _loadedModelId = modelId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _loadingPromise = (pipeline as any)('text-generation', modelId, {
    quantized: true,
    progress_callback: (p: { status?: string; progress?: number; file?: string; name?: string }) => {
      if (p.progress !== undefined) {
        post({ type: 'progress', id, pct: Math.round(p.progress), file: p.file ?? p.name ?? '' })
      }
    },
  })
    .then((pipe: TextGenPipeline) => {
      _pipe = pipe
      _loadingPromise = null
      return pipe
    })
    .catch((err: unknown) => {
      _loadingPromise = null
      _loadedModelId = null
      throw err
    })

  return _loadingPromise
}

// Apply the model's chat template, falling back to plain concatenation when the
// tokenizer doesn't expose apply_chat_template (older ONNX exports).
function applyTemplate(pipe: TextGenPipeline, messages: ChatMessage[]): string {
  try {
    const tokenizer = pipe.tokenizer
    if (typeof tokenizer?.apply_chat_template === 'function') {
      return tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      }) as string
    }
  } catch {
    // fall through to manual template
  }
  return messages.map((m) => `<|${m.role}|>\n${m.content}`).join('\n') + '\n<|assistant|>\n'
}

async function generate(msg: Extract<InMsg, { type: 'generate' }>): Promise<void> {
  const pipe = await getEngine(msg.modelId, msg.id)
  const prompt = applyTemplate(pipe, msg.messages)
  const temperature = msg.opts.temperature ?? 0.1

  _stopper = new InterruptableStoppingCriteria()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genOpts: Record<string, any> = {
    max_new_tokens: msg.opts.max_tokens ?? 512,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false,
    stopping_criteria: _stopper,
  }

  try {
    if (msg.stream) {
      genOpts.streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          if (text) post({ type: 'token', id: msg.id, text })
        },
      })
      await pipe(prompt, genOpts)
      post({ type: 'done', id: msg.id })
    } else {
      const result = await pipe(prompt, genOpts)
      const text = (result as Array<{ generated_text: string }>)[0]?.generated_text ?? ''
      post({ type: 'done', id: msg.id, text })
    }
  } finally {
    _stopper = null
  }
}

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  switch (msg.type) {
    case 'load':
      getEngine(msg.modelId, msg.id)
        .then(() => post({ type: 'ready', id: msg.id }))
        .catch((err) => post({ type: 'error', id: msg.id, message: errMessage(err) }))
      break
    case 'generate':
      generate(msg).catch((err) => post({ type: 'error', id: msg.id, message: errMessage(err) }))
      break
    case 'interrupt':
      _stopper?.interrupt()
      break
    case 'reset':
      _pipe = null
      _loadingPromise = null
      _loadedModelId = null
      break
  }
}
