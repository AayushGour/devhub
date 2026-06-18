import tiktokenWasmUrl from 'tiktoken/lite/tiktoken_bg.wasm?url'

export type TokenizerFamily = 'gpt' | 'local'

export interface TokenizerDef {
  id: string
  label: string
  family: TokenizerFamily
  description: string
}

export interface EncodingResult {
  tokenIds: number[]
  tokenTexts: string[]
}

export interface TokenizerInstance {
  encodeWithText(text: string): EncodingResult
}

export const TOKENIZER_DEFS: TokenizerDef[] = [
  { id: 'cl100k_base', label: 'cl100k_base', family: 'gpt', description: 'GPT-3.5 / GPT-4' },
  { id: 'o200k_base', label: 'o200k_base', family: 'gpt', description: 'GPT-4o' },
  { id: 'p50k_base', label: 'p50k_base', family: 'gpt', description: 'Codex' },
  {
    id: 'Qwen/Qwen2.5-0.5B',
    label: 'Qwen2.5',
    family: 'local',
    description: 'Qwen 2.5 family',
  },
  {
    id: 'microsoft/phi-3.5-mini-instruct',
    label: 'Phi-3.5',
    family: 'local',
    description: 'Phi 3.5 Mini',
  },
  {
    id: 'NousResearch/Meta-Llama-3-8B-Instruct',
    label: 'Llama 3',
    family: 'local',
    description: 'Llama 3 family',
  },
]

let tiktokenInitPromise: Promise<void> | null = null

async function ensureTiktoken(): Promise<void> {
  if (!tiktokenInitPromise) {
    tiktokenInitPromise = (async () => {
      const { init } = await import('tiktoken/lite/init')
      await init(async (imports) => {
        const response = await fetch(tiktokenWasmUrl)
        return WebAssembly.instantiateStreaming(response, imports)
      })
    })()
  }
  return tiktokenInitPromise
}

async function loadEncoderData(id: string) {
  switch (id) {
    case 'cl100k_base':
      return (await import('tiktoken/encoders/cl100k_base')).default
    case 'o200k_base':
      return (await import('tiktoken/encoders/o200k_base')).default
    case 'p50k_base':
      return (await import('tiktoken/encoders/p50k_base')).default
    default:
      throw new Error(`Unknown encoding: ${id}`)
  }
}

const textDecoder = new TextDecoder('utf-8', { fatal: false })

async function loadGptTokenizer(id: string): Promise<TokenizerInstance> {
  await ensureTiktoken()
  const { Tiktoken } = await import('tiktoken/lite/init')
  const data = await loadEncoderData(id)
  const enc = new Tiktoken(data.bpe_ranks, data.special_tokens, data.pat_str)

  return {
    encodeWithText(text: string): EncodingResult {
      const tokenIds = Array.from(enc.encode_ordinary(text))
      const tokenTexts = tokenIds.map((tid) =>
        textDecoder.decode(enc.decode_single_token_bytes(tid))
      )
      return { tokenIds, tokenTexts }
    },
  }
}

async function loadLocalTokenizer(modelId: string): Promise<TokenizerInstance> {
  const { AutoTokenizer } = await import('@xenova/transformers')
  const tokenizer = await AutoTokenizer.from_pretrained(modelId)

  return {
    encodeWithText(text: string): EncodingResult {
      const tokenIds: number[] = tokenizer.encode(text, null, { add_special_tokens: false })
      const tokenTexts = tokenIds.map((id) =>
        tokenizer.decode([id], { skip_special_tokens: false, clean_up_tokenization_spaces: false })
      )
      return { tokenIds, tokenTexts }
    },
  }
}

const instanceCache = new Map<string, TokenizerInstance>()

export async function loadTokenizer(def: TokenizerDef): Promise<TokenizerInstance> {
  if (instanceCache.has(def.id)) {
    return instanceCache.get(def.id)!
  }

  const instance =
    def.family === 'gpt'
      ? await loadGptTokenizer(def.id)
      : await loadLocalTokenizer(def.id)

  instanceCache.set(def.id, instance)
  return instance
}
