import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { Copy, Minimize2, AlignLeft, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settingsStore'

const DARK_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

const BTN_CLS = 'flex items-center gap-[0.31rem] px-2 py-1 rounded-[0.38rem] border border-border bg-transparent text-on-surface-muted text-[0.69rem] cursor-pointer font-[inherit] transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted disabled:opacity-40 disabled:cursor-not-allowed'

interface JsonEditorProps {
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  language?: string
  width?: string
  toolbar?: boolean
}

export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  width = '50%',
  toolbar = false,
}: JsonEditorProps) {
  const { theme: appTheme } = useSettingsStore()
  const isDark = DARK_THEMES.has(appTheme)

  const parsed = useMemo(() => {
    if (!toolbar) return null
    try { return JSON.parse(value) } catch { return undefined }
  }, [value, toolbar])

  const canAct = toolbar && value.trim() !== '' && parsed !== undefined

  const format = () => { if (canAct) onChange?.(JSON.stringify(parsed, null, 2)) }
  const minify = () => { if (canAct) onChange?.(JSON.stringify(parsed)) }
  const copy = () => navigator.clipboard.writeText(value)
  const clear = () => onChange?.('')

  return (
    <div
      className={cn('shrink-0 border-r border-border overflow-hidden', toolbar && 'flex flex-col')}
      style={{ width }}
    >
      {toolbar && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-surface shrink-0">
          <button onClick={format} disabled={!canAct} className={BTN_CLS}>
            <AlignLeft size={12} /> Format
          </button>
          <button onClick={minify} disabled={!canAct} className={BTN_CLS}>
            <Minimize2 size={12} /> Minify
          </button>
          <button onClick={copy} disabled={!value} className={BTN_CLS}>
            <Copy size={12} /> Copy
          </button>
          <button
            onClick={clear}
            className={cn(BTN_CLS, 'hover:text-red-500 hover:border-red-300')}
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      <div className={cn('overflow-hidden', toolbar ? 'flex-1 min-h-0' : 'h-full')}>
        <CodeMirror
          value={value}
          height="100%"
          theme={isDark ? 'dark' : 'light'}
          extensions={[json()]}
          readOnly={readOnly}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            autocompletion: true,
            bracketMatching: true,
          }}
          style={{ height: '100%', fontSize: 13 }}
        />
      </div>
    </div>
  )
}
