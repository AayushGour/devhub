import { useMemo } from 'react'
import { parseYaml } from '@/lib/yaml'
import DataView from './DataView'

export default function YamlView({ text }: { text: string }) {
  const { json, error } = useMemo(() => {
    if (!text.trim()) return { json: '', error: undefined }
    try {
      const parsed = parseYaml(text)
      return { json: JSON.stringify(parsed, null, 2), error: undefined }
    } catch (e) {
      return { json: '', error: (e as Error).message }
    }
  }, [text])

  return <DataView input={json} error={error} />
}
