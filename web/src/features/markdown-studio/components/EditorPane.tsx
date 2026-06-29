import Editor, { type OnMount } from '@monaco-editor/react'
import { useSettingsStore } from '@/store/settingsStore'

interface EditorPaneProps {
  defaultValue: string
  onChange: (val: string | undefined) => void
  onMount: OnMount
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  wordWrap: 'on' as const,
  lineNumbers: 'off' as const,
  fontSize: 14,
  fontFamily: "'Fira Code', 'SF Mono', Consolas, monospace",
  padding: { top: 20, bottom: 20 },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none' as const,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  folding: false,
  lineDecorationsWidth: 16,
  lineNumbersMinChars: 0,
  glyphMargin: false,
}

export default function EditorPane({ defaultValue, onChange, onMount }: EditorPaneProps) {
  const { theme } = useSettingsStore()

  return (
    <div className="flex-1 min-w-0 border-r border-border overflow-hidden">
      <Editor
        height="100%"
        language="markdown"
        defaultValue={defaultValue}
        onChange={onChange}
        onMount={onMount}
        theme={theme === 'light' ? 'vs' : 'vs-dark'}
        loading={
          <div className="flex items-center justify-center h-full text-on-surface-muted text-sm">
            Loading editor…
          </div>
        }
        options={EDITOR_OPTIONS}
      />
    </div>
  )
}
