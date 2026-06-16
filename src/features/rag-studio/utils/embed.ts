import { pipeline, env } from '@xenova/transformers'

env.allowLocalModels = false

const MODEL = 'Xenova/all-MiniLM-L6-v2'

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline>>
let _pipe: FeatureExtractionPipeline | null = null

export type EmbedProgressCallback = (pct: number, file: string) => void

export async function getEmbedder(onProgress?: EmbedProgressCallback): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe

  _pipe = await pipeline('feature-extraction', MODEL, {
    progress_callback: onProgress
      ? (p: { progress?: number; file?: string }) => {
          const pct = p.progress != null ? Math.round(p.progress) : 0
          onProgress(pct, p.file ?? '')
        }
      : undefined,
  })
  return _pipe
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (pipe as any)(text, { pooling: 'mean', normalize: true })
  const vec = Array.from(output.data as Float32Array)
  console.log(`[RAG:embed] text="${text.slice(0, 60)}…" → dim=${vec.length}, sample=[${(vec as number[]).slice(0, 3).map((v: number) => v.toFixed(4)).join(', ')}…]`)
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
