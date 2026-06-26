import { useState } from 'react'
import { Plus, Trash2, FileJson, Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JsonFile } from '../hooks/useJsonStudio'

const DASHED_BTN_CLS = 'flex items-center justify-center gap-[0.38rem] py-[0.44rem] px-3 rounded-lg border border-dashed border-border bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit] w-full hover:border-accent hover:text-accent transition-colors duration-150'

interface FilePanelProps {
  files: JsonFile[]
  activeId: string
  onSelectFile: (id: string) => void
  onRenameFile: (id: string, name: string) => void
  onRemoveFile: (id: string) => void
  onNewFile: () => void
}

export default function FilePanel({
  files, activeId, onSelectFile, onRenameFile, onRemoveFile, onNewFile,
}: FilePanelProps) {
  const list = files ?? []
  return (
    <aside className="json-file-panel w-[17.5rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-1.5 py-[0.56rem] px-[0.88rem] border-b border-border shrink-0">
        <FileJson size={13} className="text-accent" />
        <span className="text-[0.69rem] uppercase tracking-[0.04em] font-semibold text-on-surface">Files</span>
      </div>

      <div className="flex-1 overflow-y-auto p-[0.88rem] flex flex-col gap-2">
        <button onClick={onNewFile} className={DASHED_BTN_CLS}>
          <Plus size={13} /> New File
        </button>

        {list.map(file => (
          <FileRow
            key={file.id}
            file={file}
            active={file.id === activeId}
            canRemove={list.length > 1}
            onSelect={onSelectFile}
            onRename={onRenameFile}
            onRemove={onRemoveFile}
          />
        ))}
      </div>
    </aside>
  )
}

function FileRow({ file, active, canRemove, onSelect, onRename, onRemove }: {
  file: JsonFile
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
    onRename(file.id, draft.trim() || 'Untitled JSON')
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
      <FileJson size={14} className={cn('shrink-0', active ? 'text-accent' : 'text-on-surface-muted')} />

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
          placeholder="Untitled JSON"
          className="flex-1 min-w-0 bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-on-surface outline-none font-[inherit] tracking-[-0.01rem] focus:border-accent transition-colors duration-150"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs text-on-surface tracking-[-0.01rem]">
          {file.name || 'Untitled JSON'}
        </span>
      )}

      <button
        onClick={editing ? e => { e.stopPropagation(); commit() } : startEdit}
        title={editing ? 'Save name' : 'Rename file'}
        className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-accent transition-colors duration-150"
      >
        {editing ? <Check size={13} /> : <Pencil size={12} />}
      </button>

      {canRemove && !editing && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(file.id) }}
          title="Remove file"
          className="text-on-surface-muted bg-transparent border-none cursor-pointer flex p-0.5 shrink-0 hover:text-on-surface transition-colors duration-150"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}
