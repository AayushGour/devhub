import { useEffect, useRef, useState } from 'react'
import DiagramPreview from '@/features/diagram-studio/components/DiagramPreview'
import type { MermaidTheme } from '@/features/diagram-studio/hooks/useDiagramEditor'

const SELECT_CLS =
  'bg-surface-raised border border-border rounded-md px-2 py-1 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'

const THEMES: { id: MermaidTheme; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'forest', label: 'Forest' },
  { id: 'neutral', label: 'Neutral' },
]

export default function DiagramView({
  text,
  colorTheme,
}: {
  text: string
  colorTheme: 'light' | 'dark'
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [theme, setTheme] = useState<MermaidTheme>(colorTheme === 'dark' ? 'dark' : 'default')
  const [touched, setTouched] = useState(false)

  // Follow the editor theme until the user picks one explicitly.
  useEffect(() => {
    if (!touched) setTheme(colorTheme === 'dark' ? 'dark' : 'default')
  }, [colorTheme, touched])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
          Theme
        </span>
        <select
          value={theme}
          onChange={(e) => {
            setTouched(true)
            setTheme(e.target.value as MermaidTheme)
          }}
          className={SELECT_CLS}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 min-h-0">
        <DiagramPreview code={text} mermaidTheme={theme} svgRef={svgRef} />
      </div>
    </div>
  )
}
