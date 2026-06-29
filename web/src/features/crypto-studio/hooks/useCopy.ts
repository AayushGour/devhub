import { useState } from 'react'

export function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  function copy(text: string, key = 'default') {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500)
    })
  }

  return { copiedKey, copy }
}
