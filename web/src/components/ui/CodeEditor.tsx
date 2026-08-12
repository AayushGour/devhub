import Editor, { type OnMount, type EditorProps } from '@monaco-editor/react'
import { useSettingsStore } from '@/store/settingsStore'

type MonacoOptions = EditorProps['options']

const DARK_APP_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

const DEFAULT_OPTIONS: MonacoOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
}

const DEFAULT_LOADING = (
  <div className="flex items-center justify-center h-full text-on-surface-muted text-sm">
    Loading editor…
  </div>
)

interface CodeEditorProps {
  value?: string
  defaultValue?: string
  onChange?: (val: string | undefined) => void
  language: string
  readOnly?: boolean
  onMount?: OnMount
  options?: MonacoOptions
  loading?: React.ReactNode
  className?: string
}

export function CodeEditor({
  value,
  defaultValue,
  onChange,
  language,
  readOnly,
  onMount,
  options,
  loading = DEFAULT_LOADING,
  className,
}: CodeEditorProps) {
  const { theme } = useSettingsStore()
  const monacoTheme = DARK_APP_THEMES.has(theme) ? 'vs-dark' : 'vs'

  return (
    <div className={className}>
      <Editor
        height="100%"
        language={language}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onMount={onMount}
        theme={monacoTheme}
        loading={loading}
        options={{ ...DEFAULT_OPTIONS, readOnly, ...options }}
      />
    </div>
  )
}
