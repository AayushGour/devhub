import { useRef } from 'react'
import { FileDown, FileText, Sliders, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  title: string
  onTitleChange: (t: string) => void
  onExportPDF: () => void
  onExportHTML: () => void
  onExportMarkdown: () => void
  onUploadFiles: (files: { name: string; content: string }[]) => void
  stylesOpen: boolean
  onToggleStyles: () => void
}

function readFile(file: File): Promise<{ name: string; content: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve({ name: file.name, content: ev.target?.result as string })
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export default function Toolbar({
  title, onTitleChange,
  onExportPDF, onExportHTML, onExportMarkdown, onUploadFiles,
  stylesOpen, onToggleStyles,
}: ToolbarProps) {
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
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Untitled"
        className="toolbar-title bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[0.81rem] font-semibold tracking-[-0.01rem] font-[inherit] w-[11.25rem] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      <div className="flex-1" />

      <div className="relative group">
        <button
          onClick={onToggleStyles}
          className={cn(
            'flex items-center gap-[0.31rem] px-[0.62rem] py-[0.31rem] rounded-[0.44rem] border text-xs cursor-pointer font-[inherit] transition-all duration-150',
            stylesOpen
              ? 'border-accent bg-accent text-accent-text'
              : 'border-border bg-transparent text-on-surface-muted'
          )}
        >
          <Sliders size={13} />
          More
        </button>
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-[0.69rem] text-on-surface shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
          Files, Presets &amp; More
        </span>
      </div>

      <div className="w-px h-5 bg-border" />

      <button
        onClick={onExportPDF}
        className="flex items-center gap-[0.31rem] px-[0.88rem] py-1.5 rounded-full bg-accent text-accent-text border-none text-xs font-medium cursor-pointer font-[inherit] tracking-[-0.01rem] hover:bg-accent-hover active:scale-95 transition-[background-color,transform] duration-150"
      >
        <FileDown size={13} /> PDF
      </button>

      <button
        onClick={onExportHTML}
        className="flex items-center gap-[0.31rem] px-[0.88rem] py-1.5 rounded-full bg-transparent text-accent border border-accent text-xs font-normal cursor-pointer font-[inherit] tracking-[-0.01rem] active:scale-95 transition-transform duration-150"
      >
        <FileText size={13} /> HTML
      </button>

      <button
        onClick={onExportMarkdown}
        title="Download .md"
        className="flex items-center justify-center w-[1.88rem] h-[1.88rem] rounded-[0.44rem] border border-border bg-transparent text-on-surface-muted cursor-pointer text-[0.62rem] font-semibold font-[inherit] hover:text-on-surface transition-colors duration-150"
      >
        .md
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Upload .md file"
        className="flex items-center justify-center w-[1.88rem] h-[1.88rem] rounded-[0.44rem] border border-border bg-transparent text-on-surface-muted cursor-pointer hover:text-on-surface transition-colors duration-150"
      >
        <Upload size={13} />
      </button>
    </div>
  )
}
