import { useCallback, useState } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onFile: (file: File) => void
  error: string | null
}

const ACCEPT = ['image/png', 'image/jpeg']

export default function UploadZone({ onFile, error }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && ACCEPT.includes(file.type)) onFile(file)
  }, [onFile])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }, [onFile])

  return (
    <div className="flex-1 flex items-center justify-center">
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-4 w-[400px] border-2 border-dashed rounded-[20px] p-12 cursor-pointer transition-colors duration-150',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50 bg-surface-raised'
        )}
      >
        <input
          type="file"
          accept=".png,.jpg,.jpeg"
          className="sr-only"
          onChange={handleChange}
        />

        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-150',
          dragging ? 'bg-accent/15 text-accent' : 'bg-border/60 text-on-surface-muted'
        )}>
          {dragging ? <Upload size={24} /> : <ImageIcon size={24} />}
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-[15px] font-semibold text-on-surface">
            {dragging ? 'Drop to convert' : 'Drop PNG or JPG here'}
          </span>
          <span className="text-[13px] text-on-surface-muted">
            or <span className="text-accent">click to browse</span>
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {['PNG', 'JPG'].map(fmt => (
            <span key={fmt} className="text-[11px] font-medium font-mono text-on-surface-muted bg-surface border border-border rounded-full px-2.5 py-0.5">
              {fmt}
            </span>
          ))}
        </div>

        {error && (
          <p className="text-[12px] text-red-500 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2 w-full text-center">
            {error}
          </p>
        )}
      </label>
    </div>
  )
}
