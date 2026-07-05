import type { ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { useSettingsStore } from '@/store/settingsStore'

interface DiagramEditorProps {
  value: string
  onChange: (val: string | undefined) => void
  children?: ReactNode
}

const DARK_APP_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

export default function DiagramEditor({ value, onChange, children }: DiagramEditorProps) {
  const { theme: appTheme } = useSettingsStore()

  return (
    <div className="w-[50%] shrink-0 border-r border-border flex flex-col">
      <div className="flex-1 min-h-0">
      <Editor
        height="100%"
        defaultLanguage="plaintext"
        value={value}
        onChange={onChange}
        theme={DARK_APP_THEMES.has(appTheme) ? 'vs-dark' : 'vs'}
        options={{
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          lineHeight: 1.6,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          lineNumbersMinChars: 3,
          folding: false,
        }}
      />
      </div>
      {children}
    </div>
  )
}
