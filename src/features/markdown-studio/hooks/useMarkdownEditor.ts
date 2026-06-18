import { useState, useCallback, useRef } from 'react'
import type { OnMount } from '@monaco-editor/react'

export const DEFAULT_CONTENT = `# Welcome to Markdown Studio

Write markdown on the left, see the live preview on the right.

## Features

- **Live preview** — instant rendering as you type
- **Mermaid diagrams** — rendered inline
- **Syntax highlighting** — for code blocks
- **PDF export** — with diagrams rendered

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Mermaid Diagram

\`\`\`mermaid
flowchart LR
  A[Write Markdown] --> B[Parse]
  B --> C[Live Preview]
  B --> D[Export PDF]
  C --> E[Share]
  D --> E
\`\`\`

## Table

| Feature       | Status    |
|---------------|-----------|
| Live preview  | ✅ Done   |
| Mermaid       | ✅ Done   |
| PDF export    | ✅ Done   |
| Templates     | 🔜 Soon   |

> **Note:** PDF export preserves Mermaid diagrams as vector graphics.
`

export function useMarkdownEditor() {
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [title, setTitle] = useState('Untitled')
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const updateContent = useCallback((val: string | undefined) => {
    setContent(val ?? '')
  }, [])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor

    // Monaco's built-in Ctrl+V runs clipboardPasteAction which calls
    // navigator.clipboard.readText() — this can fail silently when clipboard
    // permission is not granted. Override to call it directly from within the
    // synchronous user-gesture handler so the browser grants access.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
      try {
        const text = await navigator.clipboard.readText()
        const selection = editor.getSelection()
        if (selection) {
          editor.executeEdits('', [{ range: selection, text, forceMoveMarkers: true }])
          editor.pushUndoStop()
        }
      } catch {
        // Clipboard API unavailable — fall back to native execCommand
        const textarea = editor.getDomNode()?.querySelector('textarea')
        if (textarea) {
          textarea.focus()
          document.execCommand('paste')
        }
      }
    })
  }, [])

  const loadFile = useCallback((fileContent: string, filename: string) => {
    setTitle(filename.replace(/\.md$/i, '') || 'Untitled')
    if (editorRef.current) {
      editorRef.current.setValue(fileContent)
      // Monaco fires onChange after setValue, which updates content state
    } else {
      setContent(fileContent)
    }
  }, [])

  return { content, title, setTitle, updateContent, loadFile, handleEditorMount }
}
