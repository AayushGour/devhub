import { useState } from 'react'
import type { TypeLang } from '../utils/typeGenerator'

export type JsonMode = 'format' | 'tree' | 'graph' | 'diff' | 'jsonpath' | 'schema' | 'types'

const SAMPLE_A = `{
  "name": "DevHub",
  "version": "1.0.0",
  "features": ["markdown", "diagrams", "json"],
  "config": {
    "theme": "light",
    "autosave": true,
    "maxHistory": 50
  }
}`

const SAMPLE_B = `{
  "name": "DevHub",
  "version": "2.0.0",
  "features": ["markdown", "diagrams", "json", "api"],
  "config": {
    "theme": "dark",
    "autosave": false,
    "maxHistory": 100
  },
  "license": "MIT"
}`

export function useJsonStudio() {
  const [title, setTitle] = useState('Untitled JSON')
  const [mode, setMode] = useState<JsonMode>('format')
  const [input, setInput] = useState(SAMPLE_A)
  const [diffLeft, setDiffLeft] = useState(SAMPLE_A)
  const [diffRight, setDiffRight] = useState(SAMPLE_B)
  const [jsonPathQuery, setJsonPathQuery] = useState('$.features[*]')
  const [typeLang, setTypeLang] = useState<TypeLang>('typescript')
  const [rootName, setRootName] = useState('Root')

  return {
    title, setTitle,
    mode, setMode,
    input, setInput,
    diffLeft, setDiffLeft,
    diffRight, setDiffRight,
    jsonPathQuery, setJsonPathQuery,
    typeLang, setTypeLang,
    rootName, setRootName,
  }
}

export type JsonStudioState = ReturnType<typeof useJsonStudio>
