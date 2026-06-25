import { useState, useCallback, useRef, useEffect } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { getAllFiles, getFile, putFile, deleteFile, type MdFileRecord } from '../utils/fileStore'

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

// File metadata shown in the Files panel. Content is fetched from
// IndexedDB on demand when a file is selected.
export interface MdFile {
  id: string
  name: string
}

function newId(): string {
  return crypto.randomUUID()
}

function stripMd(filename: string): string {
  return filename.replace(/\.md$/i, '') || 'Untitled'
}

export function useMarkdownEditor() {
  const [files, setFiles] = useState<MdFile[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [content, setContent] = useState<string>(DEFAULT_CONTENT)

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const contentRef = useRef<string>(DEFAULT_CONTENT)
  const activeIdRef = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<{ id: string; value: string } | null>(null)
  // True while we drive the editor programmatically (file switch / load), so
  // Monaco's resulting onChange isn't mistaken for a user edit of the old file.
  const isProgrammatic = useRef(false)

  // Keep refs in sync so editor-mount and persistence can read latest values.
  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const setEditorValue = useCallback((value: string) => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== value) {
      isProgrammatic.current = true
      editor.setValue(value)
      isProgrammatic.current = false
    }
  }, [])

  // Load persisted files (or seed a default) on first mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let all = await getAllFiles()
      if (all.length === 0) {
        const seed: MdFileRecord = { id: newId(), name: 'Untitled', content: DEFAULT_CONTENT, order: 0 }
        await putFile(seed)
        all = [seed]
      }
      if (cancelled) return
      setFiles(all.map(f => ({ id: f.id, name: f.name })))
      setActiveId(all[0].id)
      setContent(all[0].content)
      setEditorValue(all[0].content)
    })()
    return () => { cancelled = true }
  }, [setEditorValue])

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

  const updateContent = useCallback((val: string | undefined) => {
    // Ignore the onChange echoed by our own setValue during a file switch.
    if (isProgrammatic.current) return
    const next = val ?? ''
    setContent(next)
    if (activeIdRef.current) persistContent(activeIdRef.current, next)
  }, [persistContent])

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
    setContent(rec.content)
    setEditorValue(rec.content)
  }, [setEditorValue, flushPending])

  const loadFiles = useCallback(async (uploaded: { name: string; content: string }[]) => {
    if (uploaded.length === 0) return
    await flushPending()
    const baseOrder = Date.now()
    const created: MdFileRecord[] = uploaded.map((u, i) => ({
      id: newId(),
      name: stripMd(u.name),
      content: u.content,
      order: baseOrder + i,
    }))
    await Promise.all(created.map(putFile))
    setFiles(fs => [...fs, ...created.map(f => ({ id: f.id, name: f.name }))])
    setActiveId(created[0].id)
    setContent(created[0].content)
    setEditorValue(created[0].content)
  }, [setEditorValue, flushPending])

  const newFile = useCallback(async () => {
    await flushPending()
    const rec: MdFileRecord = { id: newId(), name: 'Untitled', content: '', order: Date.now() }
    await putFile(rec)
    setFiles(fs => [...fs, { id: rec.id, name: rec.name }])
    setActiveId(rec.id)
    setContent('')
    setEditorValue('')
  }, [setEditorValue, flushPending])

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
      const seed: MdFileRecord = { id: newId(), name: 'Untitled', content: DEFAULT_CONTENT, order: Date.now() }
      await putFile(seed)
      setFiles([{ id: seed.id, name: seed.name }])
      setActiveId(seed.id)
      setContent(seed.content)
      setEditorValue(seed.content)
      return
    }
    setFiles(remaining)
    if (activeIdRef.current === id) {
      const idx = files.findIndex(f => f.id === id)
      const neighbor = remaining[Math.min(idx, remaining.length - 1)]
      const rec = await getFile(neighbor.id)
      setActiveId(neighbor.id)
      setContent(rec?.content ?? '')
      setEditorValue(rec?.content ?? '')
    }
  }, [files, setEditorValue, flushPending])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    // Sync editor with whatever file finished loading before mount.
    if (editor.getValue() !== contentRef.current) editor.setValue(contentRef.current)

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

  const activeFile = files.find(f => f.id === activeId)
  const title = activeFile?.name ?? 'Untitled'

  return {
    content,
    title,
    files,
    activeId,
    setTitle,
    updateContent,
    loadFiles,
    selectFile,
    newFile,
    removeFile,
    renameFile,
    handleEditorMount,
  }
}
