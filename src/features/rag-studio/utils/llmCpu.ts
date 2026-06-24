// src/features/rag-studio/utils/llmCpu.ts
import { pipeline, TextStreamer, env } from '@huggingface/transformers'
import { createLogger } from '@/lib/logger'
import type { LLMProgressCallback, ChatMessage } from './llmGpu'

export type { LLMProgressCallback, ChatMessage }

// Match the threading config already set by the embedder
env.backends.onnx.wasm.numThreads = 1

const log = createLogger('rag:llm:cpu')

// @xenova/transformers has incomplete TypeScript types; use `any` for the pipeline instance
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
      // TextStreamer unavailable — fall back to non-streaming (yields full result at end).
      // Call pipe directly here rather than complete() to avoid re-acquiring _genLock.
      log.warn('TextStreamer unavailable, falling back to non-streaming')
      const pipe = await getEngine(modelId)
      const prompt = applyTemplate(pipe, messages)
      const result = await pipe(prompt, {
        max_new_tokens: opts.max_tokens ?? 512,
        temperature: 0.1,
        do_sample: true,
        return_full_text: false,
      })
      yield (result as Array<{ generated_text: string }>)[0]?.generated_text ?? ''
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
