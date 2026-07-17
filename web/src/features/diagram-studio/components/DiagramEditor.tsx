import type { ReactNode } from 'react'
import { CodeEditor } from '@/components/ui/CodeEditor'

interface DiagramEditorProps {
  value: string
  onChange: (val: string | undefined) => void
  children?: ReactNode
}

export default function DiagramEditor({ value, onChange, children }: DiagramEditorProps) {
  return (
    <div className="w-[50%] shrink-0 border-r border-border flex flex-col">
      <div className="flex-1 min-h-0">
        <CodeEditor
          className="h-full"
          language="plaintext"
          value={value}
          onChange={onChange}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            lineHeight: 1.6,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: 'none',
            lineNumbersMinChars: 3,
            folding: false,
          }}
        />
      </div>
      {children}
    </div>
  )
}
