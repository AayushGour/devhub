import { useState, useCallback, useEffect, useRef } from 'react'
import type { TypeLang } from '../utils/typeGenerator'
import { getAllFiles, getFile, putFile, deleteFile, type JsonFileRecord } from '../utils/fileStore'

export type JsonMode = 'tree' | 'graph' | 'diff' | 'jsonpath' | 'schema' | 'types'

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

// File metadata shown in the Files panel. Content is fetched from
// IndexedDB on demand when a file is selected.
export interface JsonFile {
  id: string
  name: string
}

function newId(): string {
  return crypto.randomUUID()
}

function stripJson(filename: string): string {
  return filename.replace(/\.json$/i, '') || 'Untitled JSON'
}

export function useJsonStudio() {
  const [mode, setMode] = useState<JsonMode>('graph')
  const [input, setInputState] = useState(SAMPLE_A)
  const [diffLeft, setDiffLeft] = useState(SAMPLE_A)
  const [diffRight, setDiffRight] = useState(SAMPLE_B)
  const [jsonPathQuery, setJsonPathQuery] = useState('$.features[*]')
  const [typeLang, setTypeLang] = useState<TypeLang>('typescript')
  const [rootName, setRootName] = useState('Root')

  const [files, setFiles] = useState<JsonFile[]>([])
  const [activeId, setActiveId] = useState<string>('')

  const activeIdRef = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ id: string; value: string } | null>(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Load persisted files (or seed a default) on first mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let all = await getAllFiles()
      if (all.length === 0) {
        const seed: JsonFileRecord = { id: newId(), name: 'Untitled JSON', content: SAMPLE_A, order: 0 }
        await putFile(seed)
        all = [seed]
      }
      if (cancelled) return
      setFiles(all.map(f => ({ id: f.id, name: f.name })))
      setActiveId(all[0].id)
      setInputState(all[0].content)
    })()
    return () => { cancelled = true }
  }, [])

  // Write any debounced edit to IndexedDB immediately. Called before switching
  // files so the outgoing file's latest edit is never dropped by the timer.
  const flushPending = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const p = pendingSave.current
    pendingSave.current = null
    if (p) {
      const rec = await getFile(p.id)
      if (rec) await putFile({ ...rec, content: p.value })
    }
  }, [])

  const persistContent = useCallback((id: string, value: string) => {
    pendingSave.current = { id, value }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void flushPending() }, 350)
  }, [flushPending])

  const setInput = useCallback((val: string) => {
    setInputState(val)
    if (activeIdRef.current) persistContent(activeIdRef.current, val)
  }, [persistContent])

  const renameFile = useCallback((id: string, name: string) => {
    setFiles(fs => fs.map(f => (f.id === id ? { ...f, name } : f)))
    getFile(id).then(rec => { if (rec) putFile({ ...rec, name }) })
  }, [])

  const setTitle = useCallback((name: string) => {
    const id = activeIdRef.current
    if (id) renameFile(id, name)
  }, [renameFile])

  const selectFile = useCallback(async (id: string) => {
    if (id === activeIdRef.current) return
    await flushPending()
    const rec = await getFile(id)
    if (!rec) return
    setActiveId(id)
    setInputState(rec.content)
  }, [flushPending])

  const loadFiles = useCallback(async (uploaded: { name: string; content: string }[]) => {
    if (uploaded.length === 0) return
    await flushPending()
    const baseOrder = Date.now()
    const created: JsonFileRecord[] = uploaded.map((u, i) => ({
      id: newId(),
      name: stripJson(u.name),
      content: u.content,
      order: baseOrder + i,
    }))
    await Promise.all(created.map(putFile))
    setFiles(fs => [...fs, ...created.map(f => ({ id: f.id, name: f.name }))])
    setActiveId(created[0].id)
    setInputState(created[0].content)
  }, [flushPending])

  const newFile = useCallback(async () => {
    await flushPending()
    const rec: JsonFileRecord = { id: newId(), name: 'Untitled JSON', content: '', order: Date.now() }
    await putFile(rec)
    setFiles(fs => [...fs, { id: rec.id, name: rec.name }])
    setActiveId(rec.id)
    setInputState('')
  }, [flushPending])

  const removeFile = useCallback(async (id: string) => {
    if (id === activeIdRef.current) {
      // Discard pending edits for the file being deleted.
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      pendingSave.current = null
    } else {
      await flushPending()
    }
    await deleteFile(id)
    setFiles(prev => {
      const remaining = prev.filter(f => f.id !== id)
      if (remaining.length === 0) {
        const seed: JsonFileRecord = { id: newId(), name: 'Untitled JSON', content: SAMPLE_A, order: Date.now() }
        void putFile(seed)
        setActiveId(seed.id)
        setInputState(seed.content)
        return [{ id: seed.id, name: seed.name }]
      }
      if (activeIdRef.current === id) {
        const idx = prev.findIndex(f => f.id === id)
        const neighbor = remaining[Math.min(idx, remaining.length - 1)]
        setActiveId(neighbor.id)
        getFile(neighbor.id).then(rec => setInputState(rec?.content ?? ''))
      }
      return remaining
    })
  }, [flushPending])

  const activeFile = files.find(f => f.id === activeId)
  const title = activeFile?.name ?? 'Untitled JSON'

  return {
    title, setTitle,
    mode, setMode,
    input, setInput,
    diffLeft, setDiffLeft,
    diffRight, setDiffRight,
    jsonPathQuery, setJsonPathQuery,
    typeLang, setTypeLang,
    rootName, setRootName,
    files, activeId,
    selectFile, newFile, removeFile, renameFile, loadFiles,
  }
}

export type JsonStudioState = ReturnType<typeof useJsonStudio>
