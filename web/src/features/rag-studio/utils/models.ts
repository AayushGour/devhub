export interface ModelEntry {
  id: string
  label: string
  family: string
  sizeLabel: string
  vramMB: number
}

export function formatVram(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

export const CURATED_MODELS: ModelEntry[] = [
  // Qwen3
  { id: 'Qwen3-0.6B-q4f16_1-MLC',  label: 'Qwen3 0.6B',  family: 'Qwen3',    sizeLabel: '0.6B', vramMB: 1403  },
  { id: 'Qwen3-1.7B-q4f16_1-MLC',  label: 'Qwen3 1.7B',  family: 'Qwen3',    sizeLabel: '1.7B', vramMB: 2037  },
  { id: 'Qwen3-4B-q4f16_1-MLC',    label: 'Qwen3 4B',    family: 'Qwen3',    sizeLabel: '4B',   vramMB: 3432  },
  { id: 'Qwen3-8B-q4f16_1-MLC',    label: 'Qwen3 8B',    family: 'Qwen3',    sizeLabel: '8B',   vramMB: 5696  },
  // Qwen3.5
  { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Qwen3.5 0.8B', family: 'Qwen3.5', sizeLabel: '0.8B', vramMB: 1629 },
  { id: 'Qwen3.5-2B-q4f16_1-MLC',   label: 'Qwen3.5 2B',   family: 'Qwen3.5', sizeLabel: '2B',   vramMB: 2245 },
  { id: 'Qwen3.5-4B-q4f16_1-MLC',   label: 'Qwen3.5 4B',   family: 'Qwen3.5', sizeLabel: '4B',   vramMB: 3868 },
  { id: 'Qwen3.5-9B-q4f16_1-MLC',   label: 'Qwen3.5 9B',   family: 'Qwen3.5', sizeLabel: '9B',   vramMB: 6433 },
  // Llama 3.x
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', family: 'Llama', sizeLabel: '1B', vramMB: 879  },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B', family: 'Llama', sizeLabel: '3B', vramMB: 2264 },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', label: 'Llama 3.1 8B', family: 'Llama', sizeLabel: '8B', vramMB: 5001 },
  // Phi
  { id: 'Phi-4-mini-instruct-q4f16_1-MLC',   label: 'Phi-4 Mini',   family: 'Phi', sizeLabel: '3.8B', vramMB: 3438 },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi-3.5 Mini', family: 'Phi', sizeLabel: '3.8B', vramMB: 3672 },
  // SmolLM2
  { id: 'SmolLM2-135M-Instruct-q0f16-MLC',   label: 'SmolLM2 135M', family: 'SmolLM2', sizeLabel: '135M', vramMB: 360  },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', family: 'SmolLM2', sizeLabel: '360M', vramMB: 376  },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B', family: 'SmolLM2', sizeLabel: '1.7B', vramMB: 1774 },
  // Gemma
  { id: 'gemma3-1b-it-q4f16_1-MLC',   label: 'Gemma 3 1B', family: 'Gemma', sizeLabel: '1B', vramMB: 711  },
  { id: 'gemma-2-2b-it-q4f16_1-MLC',  label: 'Gemma 2 2B', family: 'Gemma', sizeLabel: '2B', vramMB: 1895 },
  { id: 'gemma-2-9b-it-q4f16_1-MLC',  label: 'Gemma 2 9B', family: 'Gemma', sizeLabel: '9B', vramMB: 6422 },
  // DeepSeek R1 Distill
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',  label: 'DeepSeek R1 Qwen 7B',  family: 'DeepSeek', sizeLabel: '7B', vramMB: 5107 },
  { id: 'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC', label: 'DeepSeek R1 Llama 8B', family: 'DeepSeek', sizeLabel: '8B', vramMB: 5001 },
  // Mistral / Ministral
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',          label: 'Mistral 7B v0.3', family: 'Mistral', sizeLabel: '7B', vramMB: 4573 },
  { id: 'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC', label: 'Ministral 3B',    family: 'Mistral', sizeLabel: '3B', vramMB: 2864 },
  // OLMo 2
  { id: 'OLMo-2-0425-1B-Instruct-q4f16_1-MLC', label: 'OLMo 2 1B', family: 'OLMo', sizeLabel: '1B', vramMB: 1777 },
  { id: 'OLMo-2-1124-7B-Instruct-q4f16_1-MLC', label: 'OLMo 2 7B', family: 'OLMo', sizeLabel: '7B', vramMB: 6479 },
  // Hermes
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC', label: 'Hermes 3 3B', family: 'Hermes', sizeLabel: '3B', vramMB: 2264 },
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', label: 'Hermes 3 8B', family: 'Hermes', sizeLabel: '8B', vramMB: 4876 },
]

export const DEFAULT_MODEL_ID = 'Qwen3-4B-q4f16_1-MLC'

export const MODEL_FAMILIES = [...new Set(CURATED_MODELS.map((m) => m.family))]

export function getModelById(id: string): ModelEntry | undefined {
  return CURATED_MODELS.find((m) => m.id === id)
}

// 0.5B is ~5x faster than 1.7B on WASM (decode is memory-bound, so smaller weights
// dominate); grounded by RAG it still answers accurately. Best speed/quality balance
// for CPU. Larger CPU models remain selectable for users who prefer quality.
export const DEFAULT_CPU_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

export const CPU_MODELS: ModelEntry[] = [
  { id: 'HuggingFaceTB/SmolLM2-135M-Instruct',    label: 'SmolLM2 135M',  family: 'SmolLM2', sizeLabel: '135M', vramMB: 0 },
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct',    label: 'SmolLM2 360M',  family: 'SmolLM2', sizeLabel: '360M', vramMB: 0 },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',    label: 'SmolLM2 1.7B',  family: 'SmolLM2', sizeLabel: '1.7B', vramMB: 0 },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct',   label: 'Qwen2.5 0.5B',  family: 'Qwen2.5', sizeLabel: '0.5B', vramMB: 0 },
  { id: 'onnx-community/Qwen2.5-1.5B-Instruct',   label: 'Qwen2.5 1.5B',  family: 'Qwen2.5', sizeLabel: '1.5B', vramMB: 0 },
]

export const CPU_MODEL_FAMILIES = [...new Set(CPU_MODELS.map((m) => m.family))]

export function getModelsForEnvironment(gpuAvailable: boolean): ModelEntry[] {
  return gpuAvailable ? CURATED_MODELS : CPU_MODELS
}
