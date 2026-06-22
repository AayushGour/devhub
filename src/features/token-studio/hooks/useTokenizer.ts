import { useState, useEffect, useRef } from 'react'
import { TOKENIZER_DEFS, loadTokenizer, type EncodingResult } from '../utils/tokenizers'
import { createLogger } from '@/lib/logger'

const log = createLogger('token')

interface UseTokenizerReturn {
  result: EncodingResult | null
  loading: boolean
  error: string | null
}

export function useTokenizer(tokenizerId: string, text: string): UseTokenizerReturn {
  const [result, setResult] = useState<EncodingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!text.trim()) {
      setResult(null)
      setLoading(false)
      setError(null)
      return
    }

    const def = TOKENIZER_DEFS.find((d) => d.id === tokenizerId)
    if (!def) return

    cancelRef.current = false
    setLoading(true)
    setError(null)
    log.log(`tokenizing with "${tokenizerId}" (${text.length} chars)`)

    loadTokenizer(def)
      .then((instance) => {
        if (cancelRef.current) return
        try {
          setResult(instance.encodeWithText(text))
        } catch (e) {
          log.error('encoding failed', e)
          setError(e instanceof Error ? e.message : 'Encoding failed')
        }
        setLoading(false)
      })
      .catch((e) => {
        if (cancelRef.current) return
        log.error(`failed to load tokenizer "${tokenizerId}"`, e)
        setError(e instanceof Error ? e.message : 'Failed to load tokenizer')
        setLoading(false)
      })

    return () => {
      cancelRef.current = true
    }
  }, [tokenizerId, text])

  return { result, loading, error }
}
