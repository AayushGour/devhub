import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { useSettingsStore } from '@/store/settingsStore'

const DARK_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

interface JsonEditorProps {
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  language?: string
  width?: string
}

export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  width = '50%',
}: JsonEditorProps) {
  const { theme: appTheme } = useSettingsStore()
  const isDark = DARK_THEMES.has(appTheme)

  return (
    <div className="shrink-0 border-r border-border overflow-hidden" style={{ width }}>
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
  )
}
