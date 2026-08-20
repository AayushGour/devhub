// Main-thread client for the off-thread BGE embedder. Drop-in replacement for
// `@/lib/llm/embed` (`getEmbedder` / `embed` / `embedBatch`) backed by a single
// shared Web Worker. Message-id correlation lets many callers share one worker.

import { createLogger } from '@/lib/logger'

const log = createLogger('llm:embed-remote')

export type EmbedProgressCallback = (pct: number, file: string) => void

let _worker: Worker | null = null
function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' })
    log.log('spawned embed worker')
  }
  return _worker
}

interface ProgressPayload {
  pct?: number
  file?: string
  done?: number
  total?: number
}

// Post a job and resolve on its `ok` reply, forwarding any `progress` messages.
function request<T>(
  msg: Record<string, unknown>,
  onProgress?: (p: ProgressPayload) => void,
): Promise<T> {
  const worker = getWorker()
  const id = crypto.randomUUID()
  return new Promise<T>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const d = e.data
      if (!d || d.id !== id) return
      if (d.type === 'progress') { onProgress?.(d as ProgressPayload); return }
      worker.removeEventListener('message', handler)
      if (d.ok) resolve(d as T)
      else reject(new Error(d.error ?? 'embed worker error'))
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ id, ...msg })
  })
}

export async function getEmbedder(onProgress?: EmbedProgressCallback): Promise<void> {
  await request<{ ok: true }>({ type: 'load' }, (p) => {
    if (typeof p.pct === 'number') onProgress?.(p.pct, p.file ?? '')
  })
}

export async function embed(text: string): Promise<number[]> {
  const r = await request<{ vectors: number[][] }>({ type: 'embedBatch', texts: [text] })
  return r.vectors[0]
}

export async function embedBatch(
  texts: string[],
  onProgress?: (i: number, total: number) => void,
): Promise<number[][]> {
  if (texts.length === 0) return []
  const r = await request<{ vectors: number[][] }>(
    { type: 'embedBatch', texts },
    (p) => { if (typeof p.done === 'number' && typeof p.total === 'number') onProgress?.(p.done, p.total) },
  )
  return r.vectors
}
