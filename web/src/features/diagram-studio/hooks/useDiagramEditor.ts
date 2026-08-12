import { useState, useCallback, useRef, useEffect } from 'react'
import { TEMPLATES } from '../utils/diagramTemplates'
import { getAllFiles, getFile, putFile, deleteFile, type DiagramFileRecord } from '../utils/diagramFileStore'

export type MermaidTheme = 'default' | 'forest' | 'dark' | 'neutral'

// File metadata shown in the Files panel. Code is fetched from
// IndexedDB on demand when a file is selected.
export interface DiagramFile {
  id: string
  name: string
}

function newId(): string {
  return crypto.randomUUID()
}

let seedInFlight: Promise<void> | null = null

async function loadOrSeed(): Promise<DiagramFileRecord[]> {
  let all = await getAllFiles()
  if (all.length === 0) {
    if (!seedInFlight) {
      seedInFlight = (async () => {
        const seed: DiagramFileRecord = { id: newId(), name: 'Untitled', code: TEMPLATES[0].code, order: 0 }
        await putFile(seed)
      })()
    }
    await seedInFlight
    all = await getAllFiles()
  }
  return all
}

export function useDiagramEditor() {
  const [files, setFiles] = useState<DiagramFile[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [code, setCode] = useState<string>(TEMPLATES[0].code)
  const [mermaidTheme, setMermaidTheme] = useState<MermaidTheme>('default')

  const activeIdRef = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ id: string; value: string } | null>(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Load persisted files (or seed a default) on first mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await loadOrSeed()
      if (cancelled) return
      setFiles(all.map(f => ({ id: f.id, name: f.name })))
      setActiveId(all[0].id)
      setCode(all[0].code)
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
      if (rec) await putFile({ ...rec, code: p.value })
    }
  }, [])

  const persistCode = useCallback((id: string, value: string) => {
    pendingSave.current = { id, value }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void flushPending() }, 350)
  }, [flushPending])

  const updateCode = useCallback((val: string | undefined) => {
    const next = val ?? ''
    setCode(next)
    if (activeIdRef.current) persistCode(activeIdRef.current, next)
  }, [persistCode])

  const setTitle = useCallback((name: string) => {
    const id = activeIdRef.current
    if (!id) return
    setFiles(fs => fs.map(f => (f.id === id ? { ...f, name } : f)))
    getFile(id).then(rec => { if (rec) putFile({ ...rec, name }) })
  }, [])

  const renameFile = useCallback((id: string, name: string) => {
    setFiles(fs => fs.map(f => (f.id === id ? { ...f, name } : f)))
    getFile(id).then(rec => { if (rec) putFile({ ...rec, name }) })
  }, [])

  const selectFile = useCallback(async (id: string) => {
    if (id === activeIdRef.current) return
    await flushPending()
    const rec = await getFile(id)
    if (!rec) return
    setActiveId(id)
    setCode(rec.code)
  }, [flushPending])

  const newFile = useCallback(async () => {
    await flushPending()
    const rec: DiagramFileRecord = { id: newId(), name: 'Untitled', code: '', order: Date.now() }
    await putFile(rec)
    setFiles(fs => [...fs, { id: rec.id, name: rec.name }])
    setActiveId(rec.id)
    setCode('')
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
    const remaining = files.filter(f => f.id !== id)
    if (remaining.length === 0) {
      const seed: DiagramFileRecord = { id: newId(), name: 'Untitled', code: TEMPLATES[0].code, order: Date.now() }
      await putFile(seed)
      setFiles([{ id: seed.id, name: seed.name }])
      setActiveId(seed.id)
      setCode(seed.code)
      return
    }
    setFiles(remaining)
    if (activeIdRef.current === id) {
      const idx = files.findIndex(f => f.id === id)
      const neighbor = remaining[Math.min(idx, remaining.length - 1)]
      const rec = await getFile(neighbor.id)
      setActiveId(neighbor.id)
      setCode(rec?.code ?? '')
    }
  }, [files, flushPending])

  const activeFile = files.find(f => f.id === activeId)
  const title = activeFile?.name ?? 'Untitled'

  return {
    files, activeId, code, updateCode, title, setTitle,
    renameFile, selectFile, newFile, removeFile,
    mermaidTheme, setMermaidTheme,
  }
}
