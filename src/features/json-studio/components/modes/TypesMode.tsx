import { useMemo } from 'react'
import { Copy } from 'lucide-react'
import JsonEditor from '../JsonEditor'
import { generateTypes } from '../../utils/typeGenerator'
import type { TypeLang } from '../../utils/typeGenerator'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input' | 'setInput' | 'typeLang' | 'setTypeLang' | 'rootName' | 'setRootName'>

const LANGS: { value: TypeLang; label: string; monacoLang: string }[] = [
  { value: 'typescript', label: 'TypeScript', monacoLang: 'typescript' },
  { value: 'go', label: 'Go', monacoLang: 'go' },
  { value: 'rust', label: 'Rust', monacoLang: 'rust' },
  { value: 'java', label: 'Java', monacoLang: 'java' },
  { value: 'csharp', label: 'C#', monacoLang: 'csharp' },
]

const SELECT_CLS = 'bg-surface-raised border border-border rounded-[7px] px-[8px] py-[4px] text-[12px] text-on-surface outline-none font-[inherit] cursor-pointer'

export default function TypesMode({ input, setInput, typeLang, setTypeLang, rootName, setRootName }: Props) {
  const monacoLang = LANGS.find(l => l.value === typeLang)?.monacoLang ?? 'typescript'

  const { output, error } = useMemo(() => {
    try {
      const value = JSON.parse(input)
      return { output: generateTypes(value, rootName, typeLang), error: null }
    } catch (e) {
      return { output: '', error: (e as Error).message }
    }
  }, [input, typeLang, rootName])

  return (
    <div className="flex flex-1 min-h-0">
      <JsonEditor value={input} onChange={setInput} width="50%" />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-9 flex items-center px-4 gap-2 shrink-0 border-b border-border bg-surface-raised">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">
            Root name
          </span>
          <input
            value={rootName}
            onChange={e => setRootName(e.target.value)}
            className="bg-surface border border-border rounded-[6px] px-2 py-[3px] text-[12px] text-on-surface outline-none focus:border-accent transition-colors duration-150 w-24 font-[inherit]"
          />

          <div className="w-px h-4 bg-border" />

          <select
            value={typeLang}
            onChange={e => setTypeLang(e.target.value as TypeLang)}
            className={SELECT_CLS}
          >
            {LANGS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          <div className="flex-1" />

          {output && !error && (
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              className="flex items-center gap-[5px] text-[11px] text-on-surface-muted hover:text-on-surface transition-colors duration-150 cursor-pointer bg-transparent border-none font-[inherit]"
            >
              <Copy size={12} /> Copy
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 text-[12px] text-red-500 font-mono">
            {error}
          </div>
        )}

        {output && !error && (
          <div className="flex-1 min-h-0">
            <JsonEditor value={output} readOnly language={monacoLang} width="100%" />
          </div>
        )}

        {!input.trim() && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[12px] text-on-surface-muted">Enter JSON to generate types</p>
          </div>
        )}
      </div>
    </div>
  )
}
