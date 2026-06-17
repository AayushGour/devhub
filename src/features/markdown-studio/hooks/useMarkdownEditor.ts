import { useState, useCallback } from 'react'

const DEFAULT_CONTENT = `# Welcome to Markdown Studio

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

  const updateContent = useCallback((val: string | undefined) => {
    setContent(val ?? '')
  }, [])

  const loadFile = useCallback((fileContent: string, filename: string) => {
    setContent(fileContent)
    setTitle(filename.replace(/\.md$/i, '') || 'Untitled')
  }, [])

  return { content, title, setTitle, updateContent, loadFile }
}
