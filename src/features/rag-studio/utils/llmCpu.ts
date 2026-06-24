// src/features/rag-studio/utils/llmCpu.ts
//
// Main-thread proxy for CPU text-generation. The actual transformers.js inference
// runs in `llmCpu.worker.ts` so it never blocks the UI (a CPU-only decode is a
// long synchronous WASM call — running it here froze the whole tab). This module
// keeps the same surface as `llmGpu.ts`, so the `llm.ts` dispatcher is agnostic.
import { createLogger } from '@/lib/logger'
import type { LLMProgressCallback, ChatMessage } from './llmGpu'

export type { LLMProgressCallback, ChatMessage }

const log = createLogger('rag:llm:cpu')

// Messages posted back by the worker.
type OutMsg =
  | { type: 'progress'; id: number; pct: number; file: string }
  | { type: 'ready'; id: number }
  | { type: 'token'; id: number; text: string }
  | { type: 'done'; id: number; text?: string }
  | { type: 'error'; id: number; message: string }

interface Pending {
  onProgress?: LLMProgressCallback
  onToken?: (text: string) => void
  resolve: (text: string) => void
  reject: (err: Error) => void
}

let _worker: Worker | null = null
let _nextId = 1
const _pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (_worker) return _worker
  const w = new Worker(new URL('./llmCpu.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<OutMsg>) => {
    const msg = e.data
    const p = _pending.get(msg.id)
    if (!p) return
    switch (msg.type) {
      case 'progress':
        p.onProgress?.(msg.pct, msg.file)
        break
      case 'token':
        p.onToken?.(msg.text)
        break
      case 'ready':
        _pending.delete(msg.id)
        p.resolve('')
        break
      case 'done':
        _pending.delete(msg.id)
        p.resolve(msg.text ?? '')
        break
      case 'error':
        _pending.delete(msg.id)
        p.reject(new Error(msg.message))
        break
    }
  }
  w.onerror = (e) => {
    log.error('CPU worker crashed', e.message)
    const err = new Error(`CPU LLM worker error: ${e.message}`)
    for (const [, p] of _pending) p.reject(err)
    _pending.clear()
  }
  _worker = w
  return w
}

export function resetEngine(): void {
  if (_worker) {
    _worker.terminate()
    _worker = null
  }
  _pending.clear()
}

export function interruptGenerate(): void {
  log.log('interruptGenerate (CPU)')
  _worker?.postMessage({ type: 'interrupt' })
}

// Preload the model (drives the progress UI). Resolves once the pipeline is ready.
// Returns void — callers only await readiness; generation goes through the worker.
export function getEngine(modelId: string, onProgress?: LLMProgressCallback): Promise<void> {
  const w = getWorker()
  const id = _nextId++
  return new Promise<void>((resolve, reject) => {
    _pending.set(id, { onProgress, resolve: () => resolve(), reject })
    w.postMessage({ type: 'load', id, modelId })
  })
}

// A single pipeline can't run two generations at once. Serialize on the main side
// so the worker only ever handles one decode — keeps interrupt/streaming bookkeeping
// unambiguous (it tracks a single in-flight stopper).
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
    const w = getWorker()
    const id = _nextId++
    return await new Promise<string>((resolve, reject) => {
      _pending.set(id, { resolve, reject })
      w.postMessage({ type: 'generate', id, modelId, messages, opts, stream: false })
    })
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
    const w = getWorker()
    const id = _nextId++
    const queue: string[] = []
    let done = false
    let err: Error | null = null
    let wake: (() => void) | null = null
    const ping = () => {
      const r = wake
      wake = null
      r?.()
    }

    _pending.set(id, {
      onToken: (text) => {
        queue.push(text)
        ping()
      },
      resolve: () => {
        done = true
        ping()
      },
      reject: (e) => {
        err = e
        done = true
        ping()
      },
    })
    w.postMessage({ type: 'generate', id, modelId, messages, opts, stream: true })

    while (!done || queue.length > 0) {
      while (queue.length > 0) yield queue.shift()!
      if (!done) await new Promise<void>((r) => (wake = r))
    }
    if (err) throw err
  } finally {
    release()
  }
}
