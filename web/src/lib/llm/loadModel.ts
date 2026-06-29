import { getEngine, unloadEngine } from './engine'
import type { LLMProgressCallback } from './engine'

export async function ensureModelLoaded(modelId: string, onProgress?: LLMProgressCallback): Promise<void> {
  await getEngine(modelId, onProgress)
}

export async function unloadModel(): Promise<void> {
  await unloadEngine()
}
