import { pipeline, env } from '@huggingface/transformers'
import { createLogger } from '@/lib/logger'

env.allowLocalModels = false
// Disable multi-threading to prevent onnxruntime-web from creating blob workers,
// which break in production builds due to minified variable scoping.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1

const log = createLogger('rag:embed')
const MODEL = 'Xenova/bge-base-en-v1.5'

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline>>
let _pipe: FeatureExtractionPipeline | null = null

export type EmbedProgressCallback = (pct: number, file: string) => void

export async function getEmbedder(onProgress?: EmbedProgressCallback): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe

  log.log(`loading embedding model "${MODEL}"`)
  const done = log.time('embedder loaded')
  _pipe = await pipeline('feature-extraction', MODEL, {
    // Pin to the WASM backend. Letting transformers.js auto-select can make it
    // probe WebGPU and log "Failed to create WebGPU Context Provider" on machines
    // with a half-present GPU stack — pure noise here, the embedder runs on CPU.
    device: 'wasm',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    progress_callback: onProgress
      ? (p: any) => {
          const pct = p.progress != null ? Math.round(p.progress) : 0
          onProgress(pct, p.file ?? '')
        }
      : undefined,
  })
  done()
  return _pipe
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (pipe as any)(text, { pooling: 'mean', normalize: true })
  const vec = Array.from(output.data as Float32Array)
  log.log(`text="${text.slice(0, 60)}…" → dim=${vec.length}, sample=[${(vec as number[]).slice(0, 3).map((v: number) => v.toFixed(4)).join(', ')}…]`)
  return vec as number[]
}

export async function embedBatch(
  texts: string[],
  onProgress?: (i: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    results.push(await embed(texts[i]))
    onProgress?.(i + 1, texts.length)
  }
  return results
}
