import Editor from '@monaco-editor/react'
import { useSettingsStore } from '@/store/settingsStore'

interface EditorPaneProps {
  value: string
  onChange: (val: string | undefined) => void
}

const monacoTheme = (appTheme: string) =>
  appTheme === 'light' ? 'vs' : 'vs-dark'

export default function EditorPane({ value, onChange }: EditorPaneProps) {
  const { theme } = useSettingsStore()

  return (
    <div className="flex-1 min-w-0 border-r border-border overflow-hidden">
      <Editor
        height="100%"
        language="markdown"
        value={value}
        onChange={onChange}
        theme={monacoTheme(theme)}
        loading={
          <div className="flex items-center justify-center h-full text-on-surface-muted text-sm">
            Loading editor…
          </div>
        }
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'off',
          fontSize: 14,
          fontFamily: "'Fira Code', 'SF Mono', Consolas, monospace",
          padding: { top: 20, bottom: 20 },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          folding: false,
          lineDecorationsWidth: 16,
          lineNumbersMinChars: 0,
          glyphMargin: false,
        }}
      />
    </div>
  )
}
