import { useState, useCallback } from 'react'
import { TEMPLATES } from '../utils/diagramTemplates'

export type MermaidTheme = 'default' | 'forest' | 'dark' | 'neutral'

export function useDiagramEditor() {
  const [title, setTitle] = useState('Untitled Diagram')
  const [code, setCode] = useState(TEMPLATES[0].code)
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>('default')

  const updateCode = useCallback((val: string | undefined) => {
    setCode(val ?? '')
  }, [])

  return { title, setTitle, code, updateCode, mermaidTheme, setMermaidTheme }
}
