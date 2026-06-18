import { useState } from 'react'
import type { CryptoMode } from '../utils/constants'

export function useCryptoStudio() {
  const [mode, setMode] = useState<CryptoMode>('jwt')
  return { mode, setMode }
}
