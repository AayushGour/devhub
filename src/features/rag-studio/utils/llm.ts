import { isWebGpuAvailable } from './webgpu'
import { getModelsForEnvironment, DEFAULT_MODEL_ID, DEFAULT_CPU_MODEL_ID } from './models'
import * as gpu from './llmGpu'
import * as cpu from './llmCpu'

export type { LLMProgressCallback, ChatMessage } from './llmGpu'

let _gpuAvailable: boolean | null = null

async function detectBackend(): Promise<boolean> {
  if (_gpuAvailable === null) _gpuAvailable = await isWebGpuAvailable()
  return _gpuAvailable
}

function resolveModelId(modelId: string, gpuAvailable: boolean): string {
  const models = getModelsForEnvironment(gpuAvailable)
  if (models.some((m) => m.id === modelId)) return modelId
  return gpuAvailable ? DEFAULT_MODEL_ID : DEFAULT_CPU_MODEL_ID
}

export function resetEngine(): void {
  gpu.resetEngine()
  cpu.resetEngine()
}

export function interruptGenerate(): void {
  gpu.interruptGenerate()
  cpu.interruptGenerate()
}

export async function getEngine(modelId: string, onProgress?: gpu.LLMProgressCallback) {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  return gpuAvailable ? gpu.getEngine(id, onProgress) : cpu.getEngine(id, onProgress)
}

export async function complete(
  modelId: string,
  messages: gpu.ChatMessage[],
  opts: { max_tokens?: number; temperature?: number } = {},
): Promise<string> {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  return gpuAvailable ? gpu.complete(id, messages, opts) : cpu.complete(id, messages, opts)
}

export async function* streamComplete(
  modelId: string,
  messages: gpu.ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
  const gpuAvailable = await detectBackend()
  const id = resolveModelId(modelId, gpuAvailable)
  const stream = gpuAvailable
    ? gpu.streamComplete(id, messages, opts)
    : cpu.streamComplete(id, messages, opts)
  yield* stream
}
