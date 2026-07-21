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
