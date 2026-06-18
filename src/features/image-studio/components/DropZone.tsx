import { useCallback, useState } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_MIMES, ACCEPTED_EXTENSIONS } from '../utils/formatInfo'

interface Props {
  onFiles: (files: File[]) => void
  compact?: boolean
}

function filterValid(fileList: FileList | null): File[] {
  if (!fileList) return []
  return Array.from(fileList).filter(f => ACCEPTED_MIMES.includes(f.type) || /\.tiff?$/i.test(f.name))
}

export default function DropZone({ onFiles, compact = false }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = filterValid(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }, [onFiles])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterValid(e.target.files)
    if (files.length) onFiles(files)
    e.target.value = ''
  }, [onFiles])

  if (compact) {
    return (
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex items-center justify-center gap-2 h-10 mx-3 mb-3 border border-dashed rounded-lg cursor-pointer text-[0.75rem] transition-colors duration-150',
          dragging
            ? 'border-accent text-accent bg-accent/5'
            : 'border-border text-on-surface-muted hover:border-accent/50 hover:text-on-surface'
        )}
      >
        <input type="file" accept={ACCEPTED_EXTENSIONS} multiple className="sr-only" onChange={handleChange} />
        <Upload size={13} />
        Add more images
      </label>
    )
  }

  const formats = ['PNG', 'JPG', 'WEBP', 'GIF', 'BMP', 'SVG', 'ICO', 'AVIF', 'TIFF']

  return (
    <div className="flex-1 flex items-center justify-center">
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-4 w-[26rem] border-2 border-dashed rounded-[1.25rem] p-12 cursor-pointer transition-colors duration-150',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50 bg-surface-raised'
        )}
      >
        <input type="file" accept={ACCEPTED_EXTENSIONS} multiple className="sr-only" onChange={handleChange} />

        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-150',
          dragging ? 'bg-accent/15 text-accent' : 'bg-border/60 text-on-surface-muted'
        )}>
          {dragging ? <Upload size={24} /> : <ImageIcon size={24} />}
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-[0.94rem] font-semibold text-on-surface">
            {dragging ? 'Drop to add' : 'Drop images here'}
          </span>
          <span className="text-[0.81rem] text-on-surface-muted">
            or <span className="text-accent">click to browse</span> — multiple files supported
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {formats.map(fmt => (
            <span key={fmt} className="text-[0.63rem] font-medium font-mono text-on-surface-muted bg-surface border border-border rounded-full px-2 py-0.5">
              {fmt}
            </span>
          ))}
        </div>
      </label>
    </div>
  )
}
