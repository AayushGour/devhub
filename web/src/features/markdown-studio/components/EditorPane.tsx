import type { OnMount } from '@monaco-editor/react'
import { CodeEditor } from '@/components/ui/CodeEditor'

interface EditorPaneProps {
  defaultValue: string
  onChange: (val: string | undefined) => void
  onMount: OnMount
}

const EDITOR_OPTIONS = {
  wordWrap: 'on' as const,
  lineNumbers: 'off' as const,
  fontSize: 14,
  fontFamily: "'Fira Code', 'SF Mono', Consolas, monospace",
  padding: { top: 20, bottom: 20 },
  renderLineHighlight: 'none' as const,
  overviewRulerBorder: false,
  folding: false,
  lineDecorationsWidth: 16,
  lineNumbersMinChars: 0,
  glyphMargin: false,
}

export default function EditorPane({ defaultValue, onChange, onMount }: EditorPaneProps) {
  return (
    <CodeEditor
      className="flex-1 min-w-0 border-r border-border overflow-hidden"
      language="markdown"
      defaultValue={defaultValue}
      onChange={onChange}
      onMount={onMount}
      options={EDITOR_OPTIONS}
    />
  )
}
