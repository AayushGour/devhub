// Off-thread BGE embedder. Hosts the transformers.js feature-extraction pipeline
// so embedding never blocks the UI thread (previously main-thread WASM with a
// setTimeout yield hack). Jobs are serialized through a promise chain so the
// pipeline is never invoked reentrantly.

import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
// Disable multi-threading to prevent onnxruntime-web from creating blob workers,
// which break in production builds due to minified variable scoping.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1

const MODEL = 'Xenova/bge-base-en-v1.5'
type Pipe = Awaited<ReturnType<typeof pipeline>>

let _pipe: Pipe | null = null
let _loading: Promise<Pipe> | null = null

async function getPipe(id: string): Promise<Pipe> {
  if (_pipe) return _pipe
  if (!_loading) {
    _loading = pipeline('feature-extraction', MODEL, {
      device: 'wasm',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (p: any) => {
        const pct = p.progress != null ? Math.round(p.progress) : 0
        self.postMessage({ id, type: 'progress', pct, file: p.file ?? '' })
      },
    })
  }
  _pipe = await _loading
  return _pipe
}

async function embedOne(pipe: Pipe, text: string): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = await (pipe as any)(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data as Float32Array)
}

type Job =
  | { id: string; type: 'load' }
  | { id: string; type: 'embedBatch'; texts: string[] }

async function handle(job: Job): Promise<void> {
  try {
    if (job.type === 'load') {
      await getPipe(job.id)
      self.postMessage({ id: job.id, ok: true })
      return
    }
    // embedBatch
    const pipe = await getPipe(job.id)
    const vectors: number[][] = []
    for (let i = 0; i < job.texts.length; i++) {
      vectors.push(await embedOne(pipe, job.texts[i]))
      self.postMessage({ id: job.id, type: 'progress', done: i + 1, total: job.texts.length })
    }
    self.postMessage({ id: job.id, ok: true, vectors })
  } catch (err) {
    self.postMessage({ id: job.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// Serialize all jobs — one pipeline invocation at a time.
let chain: Promise<void> = Promise.resolve()
self.onmessage = ({ data }: MessageEvent<Job>) => {
  chain = chain.then(() => handle(data))
}
