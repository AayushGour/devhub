import { FileImage, FileType, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MermaidTheme } from '../hooks/useDiagramEditor'
import type { DiagramType } from '../utils/diagramTemplates'
import { DIAGRAM_TYPE_LABELS } from '../utils/diagramTemplates'

const MERMAID_THEMES: { value: MermaidTheme; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'forest', label: 'Forest' },
  { value: 'dark', label: 'Dark' },
  { value: 'neutral', label: 'Neutral' },
]

const SELECT_CLS = 'bg-transparent border border-border rounded-[7px] px-[8px] py-[5px] text-xs text-on-surface-muted outline-none font-[inherit] cursor-pointer'

interface DiagramToolbarProps {
  title: string
  onTitleChange: (t: string) => void
  mermaidTheme: MermaidTheme
  onMermaidThemeChange: (t: MermaidTheme) => void
  diagramType: DiagramType | null
  onOpenTemplates: () => void
  onExportSVG: () => void
  onExportPNG: () => void
}

export default function DiagramToolbar({
  title, onTitleChange,
  mermaidTheme, onMermaidThemeChange,
  diagramType, onOpenTemplates,
  onExportSVG, onExportPNG,
}: DiagramToolbarProps) {
  return (
    <div className="h-11 flex items-center px-4 gap-[10px] shrink-0 border-b border-border bg-surface">
      <input
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="Untitled Diagram"
        className="toolbar-title bg-transparent border-0 border-b border-b-transparent outline-none text-on-surface text-[13px] font-semibold tracking-[-0.2px] font-[inherit] w-[180px] px-1 py-0.5 focus:border-b-accent transition-colors duration-150"
      />

      {diagramType && (
        <span className="text-[11px] font-medium text-on-surface-muted bg-surface-raised border border-border rounded-full px-2 py-0.5 tracking-[-0.1px] shrink-0">
          {DIAGRAM_TYPE_LABELS[diagramType]}
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenTemplates}
        className={cn(
          'flex items-center gap-[5px] px-[10px] py-[5px] rounded-[7px] border border-border',
          'bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit]',
          'transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted'
        )}
      >
        <LayoutTemplate size={13} />
        Templates
      </button>

      <div className="w-px h-5 bg-border" />

      <select
        value={mermaidTheme}
        onChange={e => onMermaidThemeChange(e.target.value as MermaidTheme)}
        className={SELECT_CLS}
        title="Diagram theme"
      >
        {MERMAID_THEMES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <div className="w-px h-5 bg-border" />

      <button
        onClick={onExportSVG}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-accent text-accent-text border-none text-xs font-medium cursor-pointer font-[inherit] tracking-[-0.15px] hover:bg-accent-hover active:scale-95 transition-[background-color,transform] duration-150"
      >
        <FileImage size={13} /> SVG
      </button>

      <button
        onClick={onExportPNG}
        className="flex items-center gap-[5px] px-[14px] py-1.5 rounded-full bg-transparent text-accent border border-accent text-xs font-normal cursor-pointer font-[inherit] tracking-[-0.15px] active:scale-95 transition-transform duration-150"
      >
        <FileType size={13} /> PNG
      </button>
    </div>
  )
}
