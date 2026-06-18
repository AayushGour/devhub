import { useState, useEffect, useRef } from 'react'
import { TOKENIZER_DEFS, loadTokenizer, type EncodingResult } from '../utils/tokenizers'

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

    loadTokenizer(def)
      .then((instance) => {
        if (cancelRef.current) return
        try {
          setResult(instance.encodeWithText(text))
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Encoding failed')
        }
        setLoading(false)
      })
      .catch((e) => {
        if (cancelRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load tokenizer')
        setLoading(false)
      })

    return () => {
      cancelRef.current = true
    }
  }, [tokenizerId, text])

  return { result, loading, error }
}
