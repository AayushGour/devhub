import { useRef } from 'react'
import { Files, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import type { JsonMode, JsonStudioState } from '../hooks/useJsonStudio'

const MODES: { id: JsonMode; label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'graph', label: 'Graph' },
  { id: 'jsonpath', label: 'JSONPath' },
  { id: 'schema', label: 'Schema' },
  { id: 'types', label: 'Types' },
  { id: 'diff', label: 'Diff' },
]

type Props = Pick<JsonStudioState, 'title' | 'setTitle' | 'mode' | 'setMode'> & {
  filesOpen: boolean
  onToggleFiles: () => void
  onUploadFiles: (files: { name: string; content: string }[]) => void
}

function readFile(file: File): Promise<{ name: string; content: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve({ name: file.name, content: ev.target?.result as string })
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export default function JsonToolbar({
  title, setTitle, mode, setMode, filesOpen, onToggleFiles, onUploadFiles,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const results = await Promise.all(Array.from(fileList).map(readFile))
    onUploadFiles(results)
    e.target.value = ''
  }

  return (
    <div className="h-11 flex items-center px-4 gap-[0.62rem] shrink-0 border-b border-border bg-surface">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Untitled JSON"
        className="bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[0.81rem] font-semibold tracking-[-0.01rem] font-[inherit] w-[10rem] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'px-[0.62rem] py-[0.25rem] rounded-[0.38rem] text-[0.75rem] font-medium font-[inherit] border-none cursor-pointer transition-colors duration-150 tracking-[-0.01rem]',
              mode === m.id
                ? 'bg-surface-raised text-on-surface'
                : 'bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Tooltip content="Upload .json file">
        <button
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload .json file"
          className="flex items-center justify-center w-[1.88rem] h-[1.88rem] rounded-[0.44rem] border border-border bg-transparent text-on-surface-muted cursor-pointer hover:text-on-surface transition-colors duration-150"
        >
          <Upload size={13} />
        </button>
      </Tooltip>

      <Tooltip content="Files">
        <button
          onClick={onToggleFiles}
          className={cn(
            'flex items-center gap-[0.31rem] px-[0.62rem] py-[0.31rem] rounded-[0.44rem] border text-xs cursor-pointer font-[inherit] transition-all duration-150',
            filesOpen
              ? 'border-accent bg-accent text-accent-text'
              : 'border-border bg-transparent text-on-surface-muted hover:text-on-surface'
          )}
        >
          <Files size={13} />
          Files
        </button>
      </Tooltip>
    </div>
  )
}
