import { useRef } from 'react'
import { FileDown, FileText, Sliders, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  title: string
  onTitleChange: (t: string) => void
  onExportPDF: () => void
  onExportHTML: () => void
  onExportMarkdown: () => void
  onUpload: (content: string, filename: string) => void
  stylesOpen: boolean
  onToggleStyles: () => void
}

export default function Toolbar({
  title, onTitleChange,
  onExportPDF, onExportHTML, onExportMarkdown, onUpload,
  stylesOpen, onToggleStyles,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onUpload(ev.target?.result as string, file.name)
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="h-11 flex items-center px-4 gap-[10px] shrink-0 border-b border-border bg-surface">
      <input
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Untitled"
        className="toolbar-title bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[13px] font-semibold tracking-[-0.2px] font-[inherit] w-[180px] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      <div className="flex-1" />

      <button
        onClick={onToggleStyles}
        title="Toggle style panel"
        className={cn(
          'flex items-center gap-[5px] px-[10px] py-[5px] rounded-[7px] border text-xs cursor-pointer font-[inherit] transition-all duration-150',
          stylesOpen
            ? 'border-accent bg-accent text-accent-text'
            : 'border-border bg-transparent text-on-surface-muted'
        )}
      >
        <Sliders size={13} />
        Styles
      </button>

      <div className="w-px h-5 bg-border" />

      <button
        onClick={onExportPDF}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-accent text-accent-text border-none text-xs font-medium cursor-pointer font-[inherit] tracking-[-0.15px] hover:bg-accent-hover active:scale-95 transition-[background-color,transform] duration-150"
      >
        <FileDown size={13} /> PDF
      </button>

      <button
        onClick={onExportHTML}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-transparent text-accent border border-accent text-xs font-normal cursor-pointer font-[inherit] tracking-[-0.15px] active:scale-95 transition-transform duration-150"
      >
        <FileText size={13} /> HTML
      </button>

      <button
        onClick={onExportMarkdown}
        title="Download .md"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border border-border bg-transparent text-on-surface-muted cursor-pointer text-[10px] font-semibold font-[inherit] hover:text-on-surface transition-colors duration-150"
      >
        .md
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Upload .md file"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-[7px] border border-border bg-transparent text-on-surface-muted cursor-pointer hover:text-on-surface transition-colors duration-150"
      >
        <Upload size={13} />
      </button>
    </div>
  )
}
