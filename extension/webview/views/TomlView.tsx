import { useMemo } from 'react'
import { parseToml } from '@/lib/toml'
import DataView from './DataView'

export default function TomlView({ text }: { text: string }) {
  const { json, error } = useMemo(() => {
    if (!text.trim()) return { json: '', error: undefined }
    try {
      const parsed = parseToml(text)
      return { json: JSON.stringify(parsed, null, 2), error: undefined }
    } catch (e) {
      return { json: '', error: (e as Error).message }
    }
  }, [text])

  return <DataView input={json} error={error} />
}
