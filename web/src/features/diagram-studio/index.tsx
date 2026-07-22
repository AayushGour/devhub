import { useRef, useState } from 'react'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'
import DiagramToolbar from './components/DiagramToolbar'
import DiagramEditor from './components/DiagramEditor'
import DiagramPreview from './components/DiagramPreview'
import DiagramAIPrompt from './components/DiagramAIPrompt'
import DiagramFilesPanel from './components/DiagramFilesPanel'
import TemplateModal from './components/TemplateModal'
import { useDiagramEditor } from './hooks/useDiagramEditor'
import { useDiagramAI } from './hooks/useDiagramAI'
import { detectDiagramType } from './utils/diagramTemplates'
import { exportSVG, exportPNG } from './utils/diagramExport'

export default function DiagramStudioPage() {
  const {
    title, setTitle, code, updateCode, mermaidTheme, setMermaidTheme,
    files, activeId, selectFile, newFile, removeFile, renameFile,
  } = useDiagramEditor()
  const { generate, isGenerating, status, error } = useDiagramAI(updateCode)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [editorCollapsed, setEditorCollapsed] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)

  return (
    <div className="studio-root">
      <DiagramToolbar
        title={title}
        onTitleChange={setTitle}
        mermaidTheme={mermaidTheme}
        onMermaidThemeChange={setMermaidTheme}
        diagramType={detectDiagramType(code)}
        onOpenTemplates={() => setTemplatesOpen(true)}
        filesOpen={filesOpen}
        onToggleFiles={() => setFilesOpen(v => !v)}
        onExportSVG={() => svgRef.current && exportSVG(svgRef.current, title)}
        onExportPNG={() => svgRef.current && exportPNG(svgRef.current, title)}
      />

      <div className="flex flex-1 min-h-0">
        <CollapsiblePanel
          collapsed={editorCollapsed}
          onToggle={() => setEditorCollapsed(v => !v)}
          width="50%"
          labelExpand="Show editor"
          labelCollapse="Hide editor"
        >
          <DiagramEditor value={code} onChange={updateCode}>
            <DiagramAIPrompt onGenerate={generate} isGenerating={isGenerating} status={status} error={error} />
          </DiagramEditor>
        </CollapsiblePanel>
        <DiagramPreview
          code={code}
          mermaidTheme={mermaidTheme}
          svgRef={svgRef}
        />
        {filesOpen && (
          <DiagramFilesPanel
            files={files}
            activeId={activeId}
            onSelectFile={selectFile}
            onRenameFile={renameFile}
            onRemoveFile={removeFile}
            onNewFile={newFile}
          />
        )}
      </div>

      <TemplateModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelect={updateCode}
      />
    </div>
  )
}
