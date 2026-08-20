// Main-thread client for the tree-sitter chunk worker.

import type { CodeChunk } from '../utils/chunkCode'

export interface ChunkedFile {
  path: string
  chunks: CodeChunk[]
}

let _worker: Worker | null = null
function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' })
  }
  return _worker
}

export function chunkFiles(files: { path: string; content: string }[]): Promise<ChunkedFile[]> {
  if (files.length === 0) return Promise.resolve([])
  const worker = getWorker()
  const id = crypto.randomUUID()
  return new Promise<ChunkedFile[]>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const d = e.data
      if (!d || d.id !== id) return
      worker.removeEventListener('message', handler)
      if (d.ok) resolve(d.results as ChunkedFile[])
      else reject(new Error(d.error ?? 'chunk worker error'))
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ id, files })
  })
}
