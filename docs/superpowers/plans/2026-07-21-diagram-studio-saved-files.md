# Diagram Studio Saved Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give diagram-studio the same save/list/switch/rename/delete file capability that markdown-studio already has, persisted in IndexedDB, so diagrams survive reloads and users can keep multiple named diagrams.

**Architecture:** A new feature-local IndexedDB store (`diagramFileStore.ts`, mirroring markdown-studio's `fileStore.ts` exactly — separate DB, not shared) backs a rewritten `useDiagramEditor` hook that adds multi-file state (`files`, `activeId`, `selectFile`, `newFile`, `removeFile`, `renameFile`) alongside the existing `code`/`mermaidTheme` state. A new `DiagramFilesPanel` component (mirroring markdown-studio's `FilesSection`/`FileRow`, minus the tab chrome markdown-studio needs for its styling features) renders the file list as a right-side aside, toggled from a new toolbar button.

**Tech Stack:** React, TypeScript, IndexedDB (native, no libraries), Tailwind, lucide-react icons, `@monaco-editor/react` (via the existing `CodeEditor` wrapper, which is a controlled component — no uncontrolled-editor ref workaround needed, unlike markdown-studio's Monaco usage).

## Global Constraints

- **No unit tests for the storage/hook layer.** Matches existing precedent: `markdown-studio/utils/fileStore.ts` and `markdown-studio/hooks/useMarkdownEditor.ts` have zero test files, and no `fake-indexeddb` polyfill is installed (`package.json` has no such dependency) — IndexedDB is not testable in this repo's jsdom vitest environment today. Verify each task with `npx tsc --noEmit` (per this repo's CLAUDE.md) plus the manual browser check described in the task, not new unit tests. Do not introduce a `fake-indexeddb` dependency to work around this — out of scope.
- **Diagram content field is named `code`** (not `content`) — matches the existing `useDiagramEditor`/`DiagramEditor`/`DiagramPreview` naming already in this codebase.
- **`mermaidTheme` stays global session state, not per-file** — matches markdown-studio, where theme/style settings are session-wide, applied to whichever file is open, never persisted per-file.
- **IndexedDB db name:** `'diagram-studio'`, store name: `'files'`, key path: `'id'`, version: `1` — same shape as markdown-studio's store, different db name.
- **IDs via `crypto.randomUUID()`, ordering via `order: Date.now()`** — same as markdown-studio.
- **Debounce persisted code writes at 350ms** — same interval as markdown-studio's `persistContent`.
- **`DiagramFilesPanel` has no section tabs** (unlike markdown-studio's `StylePanel`, which has Files/Preset/Doc/Elements tabs) — diagram-studio has no per-element styling feature, so the panel is just the file list, full-height.
- **Panel styling:** `w-[17.5rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden` aside, `overflow-y-auto p-[0.88rem]` body — identical classes to markdown-studio's `StylePanel` aside.
- **`FileRow` UX identical to markdown-studio's:** click row to select, pencil icon for inline rename (commit on Enter/blur, cancel on Escape), trash icon to delete (hidden when only 1 file remains), "New File" dashed button above the list.
- **Toolbar toggle button** follows `DiagramToolbar`'s existing button visual pattern (same classes as the "Templates" button: `flex items-center gap-[0.31rem] px-[0.62rem] py-[0.31rem] rounded-[0.44rem] border border-border bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit] transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted`), with an accent-filled active state when the panel is open (matching markdown-studio's toggle: `border-accent bg-accent text-accent-text` when open).
- **Per CLAUDE.md:** Tailwind-first, no inline styles, `cn()` for all conditional classNames, run `npx tsc --noEmit` after every file change.

---

### Task 1: Diagram file storage layer

**Files:**
- Create: `web/src/features/diagram-studio/utils/diagramFileStore.ts`

**Interfaces:**
- Produces: `DiagramFileRecord { id: string; name: string; code: string; order: number }`, `DiagramFileMeta = Pick<DiagramFileRecord, 'id' | 'name' | 'order'>`, `getAllFiles(): Promise<DiagramFileRecord[]>`, `getFile(id: string): Promise<DiagramFileRecord | undefined>`, `putFile(file: DiagramFileRecord): Promise<void>`, `deleteFile(id: string): Promise<void>`

- [ ] **Step 1: Create the storage module**

```typescript
// web/src/features/diagram-studio/utils/diagramFileStore.ts

// IndexedDB-backed store for Diagram Studio files.
// Each record holds the full file; the UI lists metadata and fetches
// code on demand when a file is selected.

export interface DiagramFileRecord {
  id: string
  name: string
  code: string
  order: number
}

export type DiagramFileMeta = Pick<DiagramFileRecord, 'id' | 'name' | 'order'>

const DB_NAME = 'diagram-studio'
const STORE = 'files'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllFiles(): Promise<DiagramFileRecord[]> {
  const store = await tx('readonly')
  const all = await wrap(store.getAll() as IDBRequest<DiagramFileRecord[]>)
  return all.sort((a, b) => a.order - b.order)
}

export async function getFile(id: string): Promise<DiagramFileRecord | undefined> {
  const store = await tx('readonly')
  return wrap(store.get(id) as IDBRequest<DiagramFileRecord | undefined>)
}

export async function putFile(file: DiagramFileRecord): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.put(file))
}

export async function deleteFile(id: string): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.delete(id))
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors mentioning `diagramFileStore.ts`

- [ ] **Step 3: Commit**

```bash
git add web/src/features/diagram-studio/utils/diagramFileStore.ts
git commit -m "feat(diagram-studio): add IndexedDB file storage layer"
```

---

### Task 2: Multi-file `useDiagramEditor` hook

**Files:**
- Modify: `web/src/features/diagram-studio/hooks/useDiagramEditor.ts` (full rewrite)

**Interfaces:**
- Consumes: `getAllFiles`, `getFile`, `putFile`, `deleteFile`, `DiagramFileRecord` from Task 1 (`../utils/diagramFileStore`); `TEMPLATES` from `../utils/diagramTemplates` (existing import, `TEMPLATES[0].code` is the seed diagram)
- Produces: hook return shape `{ files: DiagramFile[], activeId: string, code: string, updateCode: (val: string | undefined) => void, title: string, setTitle: (name: string) => void, renameFile: (id: string, name: string) => void, selectFile: (id: string) => Promise<void>, newFile: () => Promise<void>, removeFile: (id: string) => Promise<void>, mermaidTheme: MermaidTheme, setMermaidTheme: (t: MermaidTheme) => void }` where `DiagramFile = { id: string; name: string }`. `MermaidTheme` type is unchanged from the existing file.

- [ ] **Step 1: Replace the hook implementation**

```typescript
// web/src/features/diagram-studio/hooks/useDiagramEditor.ts
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
      let all = await getAllFiles()
      if (all.length === 0) {
        const seed: DiagramFileRecord = { id: newId(), name: 'Untitled', code: TEMPLATES[0].code, order: 0 }
        await putFile(seed)
        all = [seed]
      }
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
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: errors will appear in `index.tsx` and `DiagramToolbar.tsx` (they still use the old `setTitle`/2-field return shape and haven't been updated yet) — that's expected at this point in the plan; confirm there are no errors reported *inside* `useDiagramEditor.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add web/src/features/diagram-studio/hooks/useDiagramEditor.ts
git commit -m "feat(diagram-studio): add multi-file state to useDiagramEditor"
```

---

### Task 3: `DiagramFilesPanel` component

**Files:**
- Create: `web/src/features/diagram-studio/components/DiagramFilesPanel.tsx`

**Interfaces:**
- Consumes: `DiagramFile` type from `../hooks/useDiagramEditor` (Task 2)
- Produces: `export default function DiagramFilesPanel({ files, activeId, onSelectFile, onRenameFile, onRemoveFile, onNewFile }: DiagramFilesPanelProps)` where `DiagramFilesPanelProps = { files: DiagramFile[]; activeId: string; onSelectFile: (id: string) => void; onRenameFile: (id: string, name: string) => void; onRemoveFile: (id: string) => void; onNewFile: () => void }`

- [ ] **Step 1: Create the component**

```typescript
// web/src/features/diagram-studio/components/DiagramFilesPanel.tsx
import { useState } from 'react'
import { Plus, Trash2, FileText, Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import type { DiagramFile } from '../hooks/useDiagramEditor'

const DASHED_BTN_CLS = 'flex items-center justify-center gap-[0.38rem] py-[0.44rem] px-3 rounded-lg border border-dashed border-border bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit] w-full hover:border-accent hover:text-accent transition-colors duration-150'

interface DiagramFilesPanelProps {
  files: DiagramFile[]
  activeId: string
  onSelectFile: (id: string) => void
  onRenameFile: (id: string, name: string) => void
  onRemoveFile: (id: string) => void
  onNewFile: () => void
}

export default function DiagramFilesPanel({
  files, activeId, onSelectFile, onRenameFile, onRemoveFile, onNewFile,
}: DiagramFilesPanelProps) {
  return (
    <aside className="w-[17.5rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      <div className="flex-1 overflow-y-auto p-[0.88rem]">
        <div className="flex flex-col gap-2">
          <button onClick={onNewFile} className={DASHED_BTN_CLS}>
            <Plus size={13} /> New Diagram
          </button>

          {files.map(file => (
            <FileRow
              key={file.id}
              file={file}
              active={file.id === activeId}
              canRemove={files.length > 1}
              onSelect={onSelectFile}
              onRename={onRenameFile}
              onRemove={onRemoveFile}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}

function FileRow({ file, active, canRemove, onSelect, onRename, onRemove }: {
  file: DiagramFile
  active: boolean
  canRemove: boolean
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(file.name)

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(file.name)
    setEditing(true)
  }

  const commit = () => {
    onRename(file.id, draft.trim() || 'Untitled')
    setEditing(false)
  }

  return (
    <div
      onClick={() => !editing && onSelect(file.id)}
      className={cn(
        'flex items-center gap-2 px-[0.62rem] py-2 rounded-[0.62rem] border transition-[border-color,background-color] duration-150',
        editing ? 'cursor-default' : 'cursor-pointer',
        active ? 'border-accent bg-surface-raised' : 'border-border bg-transparent'
      )}
    >
      <FileText size={14} className={cn('shrink-0', active ? 'text-accent' : 'text-on-surface-muted')} />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') { setDraft(file.name); setEditing(false) }
          }}
          placeholder="Untitled"
          className="flex-1 min-w-0 bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-on-surface outline-none font-[inherit] tracking-[-0.01rem] focus:border-accent transition-colors duration-150"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs text-on-surface tracking-[-0.01rem]">
          {file.name || 'Untitled'}
        </span>
      )}

      <Tooltip content={editing ? 'Save name' : 'Rename diagram'}>
        <button
          onClick={editing ? e => { e.stopPropagation(); commit() } : startEdit}
          aria-label={editing ? 'Save name' : 'Rename diagram'}
          className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-accent transition-colors duration-150"
        >
          {editing ? <Check size={13} /> : <Pencil size={12} />}
        </button>
      </Tooltip>

      {canRemove && !editing && (
        <Tooltip content="Remove diagram">
          <button
            onClick={e => { e.stopPropagation(); onRemove(file.id) }}
            aria-label="Remove diagram"
            className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-on-surface transition-colors duration-150"
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors referencing `DiagramFilesPanel.tsx` (pre-existing errors from Task 2 in `index.tsx`/`DiagramToolbar.tsx` are still expected until Task 5)

- [ ] **Step 3: Commit**

```bash
git add web/src/features/diagram-studio/components/DiagramFilesPanel.tsx
git commit -m "feat(diagram-studio): add DiagramFilesPanel file list UI"
```

---

### Task 4: Toolbar toggle button

**Files:**
- Modify: `web/src/features/diagram-studio/components/DiagramToolbar.tsx:1` (import line), `:17-33` (props interface + function signature), `:51-61` (insert new button right after the existing Templates button's closing `</button>`, before the `<div className="w-px h-5 bg-border" />` separator that follows it at line 63)

**Interfaces:**
- Consumes: nothing new from other tasks (pure prop addition)
- Produces: `DiagramToolbarProps` gains `filesOpen: boolean` and `onToggleFiles: () => void`

- [ ] **Step 1: Add the import and props**

In `web/src/features/diagram-studio/components/DiagramToolbar.tsx`, change the import line:

```typescript
import { FileImage, FileType, LayoutTemplate, FolderOpen } from 'lucide-react'
```

Add two fields to `DiagramToolbarProps` (after `onOpenTemplates: () => void`):

```typescript
  onOpenTemplates: () => void
  filesOpen: boolean
  onToggleFiles: () => void
```

Add the two new params to the function signature (after `onOpenTemplates,`):

```typescript
  diagramType, onOpenTemplates,
  filesOpen, onToggleFiles,
  onExportSVG, onExportPNG,
```

- [ ] **Step 2: Add the toggle button**

Insert this button right after the existing "Templates" button's closing `</button>` and before the `<div className="w-px h-5 bg-border" />` separator that follows it:

```typescript
      <button
        onClick={onToggleFiles}
        className={cn(
          'flex items-center gap-[0.31rem] px-[0.62rem] py-[0.31rem] rounded-[0.44rem] border text-xs cursor-pointer font-[inherit] transition-colors duration-150',
          filesOpen
            ? 'border-accent bg-accent text-accent-text'
            : 'border-border bg-transparent text-on-surface-muted hover:text-on-surface hover:border-on-surface-muted'
        )}
      >
        <FolderOpen size={13} />
        Files
      </button>
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `DiagramToolbar.tsx` (errors in `index.tsx` from the still-unwired `filesOpen`/`onToggleFiles` props are expected until Task 5)

- [ ] **Step 4: Commit**

```bash
git add web/src/features/diagram-studio/components/DiagramToolbar.tsx
git commit -m "feat(diagram-studio): add Files toggle button to toolbar"
```

---

### Task 5: Wire everything into `index.tsx`

**Files:**
- Modify: `web/src/features/diagram-studio/index.tsx`

**Interfaces:**
- Consumes: `DiagramFilesPanel` (Task 3), `filesOpen`/`onToggleFiles` props on `DiagramToolbar` (Task 4), `files`/`activeId`/`selectFile`/`newFile`/`removeFile`/`renameFile` from `useDiagramEditor` (Task 2)

- [ ] **Step 1: Replace the file contents**

```typescript
// web/src/features/diagram-studio/index.tsx
import { useRef, useState } from 'react'
import DiagramToolbar from './components/DiagramToolbar'
import DiagramEditor from './components/DiagramEditor'
import DiagramPreview from './components/DiagramPreview'
import DiagramAIPrompt from './components/DiagramAIPrompt'
import DiagramFilesPanel from './components/DiagramFilesPanel'
import TemplateModal from './components/TemplateModal'
import { useDiagramEditor } from './hooks/useDiagramEditor'
import { useDiagramAI } from './hooks/useDiagramAI'
import { detectDiagramType } from './utils/diagramTemplates'
import { exportSVG, exportPNG } from './utils/diagramExport'

export default function DiagramStudioPage() {
  const {
    title, setTitle, code, updateCode, mermaidTheme, setMermaidTheme,
    files, activeId, selectFile, newFile, removeFile, renameFile,
  } = useDiagramEditor()
  const { generate, isGenerating, status, error } = useDiagramAI(updateCode)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editorCollapsed, setEditorCollapsed] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)

  return (
    <div className="studio-root">
      <DiagramToolbar
        title={title}
        onTitleChange={setTitle}
        mermaidTheme={mermaidTheme}
        onMermaidThemeChange={setMermaidTheme}
        diagramType={detectDiagramType(code)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        filesOpen={filesOpen}
        onToggleFiles={() => setFilesOpen(v => !v)}
        onExportSVG={() => svgRef.current && exportSVG(svgRef.current, title)}
        onExportPNG={() => svgRef.current && exportPNG(svgRef.current, title)}
      />

      <div className="flex flex-1 min-h-0">
        {!editorCollapsed && (
          <DiagramEditor value={code} onChange={updateCode}>
            <DiagramAIPrompt onGenerate={generate} isGenerating={isGenerating} status={status} error={error} />
          </DiagramEditor>
        )}
        <DiagramPreview
          code={code}
          mermaidTheme={mermaidTheme}
          svgRef={svgRef}
          editorCollapsed={editorCollapsed}
          onToggleEditor={() => setEditorCollapsed(v => !v)}
        />
        {filesOpen && (
          <DiagramFilesPanel
            files={files}
            activeId={activeId}
            onSelectFile={selectFile}
            onRenameFile={renameFile}
            onRemoveFile={removeFile}
            onNewFile={newFile}
          />
        )}
      </div>

      <TemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={updateCode}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors anywhere in `diagram-studio` (this resolves the Task 2/4 expected-error states)

- [ ] **Step 3: Manual verification (no unit tests for this layer — see Global Constraints)**

Start the dev server if not already running: `cd web && npm run dev`

Using a browser (or Playwright), navigate to `/tools/diagram` and verify, in order:
1. One file exists in the Files panel on first load (open it via the new "Files" toolbar button), named "Untitled", containing the default template diagram.
2. Click "New Diagram" — a second file appears, the editor clears, the new file is selected (highlighted).
3. Type new mermaid code into the editor, wait ~1 second, reload the page — the typed code is still there after reload (confirms persistence).
4. Click the pencil icon on a file row, rename it, press Enter — the name updates in the list and in the toolbar title field.
5. Create a third file, then click the trash icon on one of the non-active files — it disappears from the list without affecting the currently open file.
6. Delete files down to the last one remaining — confirm the trash icon is hidden on the last file (cannot delete the only file).
7. Switch between two files by clicking their rows — confirm the editor content and preview diagram update to match each file's saved code.

Expected: all 7 checks pass with no console errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/features/diagram-studio/index.tsx
git commit -m "feat(diagram-studio): wire saved-files panel into studio page"
```
