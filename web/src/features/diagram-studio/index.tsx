import { useRef, useState } from 'react'
import DiagramToolbar from './components/DiagramToolbar'
import DiagramEditor from './components/DiagramEditor'
import DiagramPreview from './components/DiagramPreview'
import DiagramAIPrompt from './components/DiagramAIPrompt'
import TemplateModal from './components/TemplateModal'
import { useDiagramEditor } from './hooks/useDiagramEditor'
import { useDiagramAI } from './hooks/useDiagramAI'
import { detectDiagramType } from './utils/diagramTemplates'
import { exportSVG, exportPNG } from './utils/diagramExport'

export default function DiagramStudioPage() {
  const { title, setTitle, code, updateCode, mermaidTheme, setMermaidTheme } = useDiagramEditor()
  const { generate, isGenerating, status, error } = useDiagramAI(updateCode)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editorCollapsed, setEditorCollapsed] = useState(false)

  return (
    <div className="studio-root">
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
        {!editorCollapsed && (
          <DiagramEditor value={code} onChange={updateCode}>
            <DiagramAIPrompt onGenerate={generate} isGenerating={isGenerating} status={status} error={error} />
          </DiagramEditor>
        )}
        <DiagramPreview
          code={code}
          mermaidTheme={mermaidTheme}
          svgRef={svgRef}
          editorCollapsed={editorCollapsed}
          onToggleEditor={() => setEditorCollapsed(v => !v)}
        />
      </div>

      <TemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={updateCode}
      />
    </div>
  )
}
