import { useRef, useCallback, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onFiles: (files: File[]) => void
}

export default function DropZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handle = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const valid = [...files].filter((f) => /\.(txt|md)$/i.test(f.name))
      if (valid.length) onFiles(valid)
    },
    [onFiles],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handle(e.dataTransfer.files)
      }}
      className={cn(
        'rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors duration-150 select-none',
        dragOver
          ? 'border-accent text-accent bg-accent/5'
          : 'border-border text-on-surface-muted hover:border-accent/60 hover:text-on-surface',
      )}
    >
      <Upload size={20} className="mx-auto mb-2 opacity-60" />
      <p className="text-xs leading-5">
        Drop <span className="font-medium">.txt</span> or <span className="font-medium">.md</span> files
        <br />
        or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md"
        multiple
        hidden
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  )
}
