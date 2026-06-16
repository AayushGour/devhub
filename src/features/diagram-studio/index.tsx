import { useRef, useState } from 'react'
import DiagramToolbar from './components/DiagramToolbar'
import DiagramEditor from './components/DiagramEditor'
import DiagramPreview from './components/DiagramPreview'
import TemplateModal from './components/TemplateModal'
import { useDiagramEditor } from './hooks/useDiagramEditor'
import { detectDiagramType } from './utils/diagramTemplates'
import { exportSVG, exportPNG } from './utils/diagramExport'

export default function DiagramStudioPage() {
  const { title, setTitle, code, updateCode, mermaidTheme, setMermaidTheme } = useDiagramEditor()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  return (
    <div className="-my-8 -mx-10 flex flex-col h-full">
      <DiagramToolbar
        title={title}
        onTitleChange={setTitle}
        mermaidTheme={mermaidTheme}
        onMermaidThemeChange={setMermaidTheme}
        diagramType={detectDiagramType(code)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onExportSVG={() => svgRef.current && exportSVG(svgRef.current, title)}
        onExportPNG={() => svgRef.current && exportPNG(svgRef.current, title)}
      />

      <div className="flex flex-1 min-h-0">
        <DiagramEditor value={code} onChange={updateCode} />
        <DiagramPreview code={code} mermaidTheme={mermaidTheme} svgRef={svgRef} />
      </div>

      <TemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={updateCode}
      />
    </div>
  )
}
