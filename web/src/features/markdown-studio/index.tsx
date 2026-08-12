import { useRef, useState, useCallback } from 'react'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import StylePanel from './components/StylePanel'
import ExportModal from './components/ExportModal'
import SlideDeckGuide from './components/SlideDeckGuide'
import { useMarkdownEditor, DEFAULT_CONTENT } from './hooks/useMarkdownEditor'
import { useScrollSync } from './hooks/useScrollSync'
import { exportToPDF, exportToHTML, exportToMarkdown, defaultExportConfig } from './utils/pdfExport'
import type { ExportConfig } from './utils/pdfExport'
import { exportDeckToPDF } from './utils/slideExport'
import { createDefaultSettings, createDefaultRule, type StyleSettings, type ElementRule } from './utils/styleBuilder'

export default function MarkdownStudioPage() {
  const {
    content, title, files, activeId,
    setTitle, updateContent, loadFiles,
    selectFile, newFile, removeFile, renameFile,
    handleEditorMount,
  } = useMarkdownEditor()
  const { registerEditor, previewScrollRef } = useScrollSync()
  const previewRef = useRef<HTMLDivElement>(null)

  const onEditorMount = useCallback<typeof handleEditorMount>((editor, monaco) => {
    handleEditorMount(editor, monaco)
    registerEditor(editor)
  }, [handleEditorMount, registerEditor])

  const [themeId, setThemeId] = useState('classic')
  const [styleSettings, setStyleSettings] = useState<StyleSettings>(createDefaultSettings)
  const [stylesOpen, setStylesOpen] = useState(false)
  const [deckMode, setDeckMode] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [deckGuideOpen, setDeckGuideOpen] = useState(false)
  const [editorCollapsed, setEditorCollapsed] = useState(false)

  const setDoc = useCallback((key: string, val: string) =>
    setStyleSettings(s => ({ ...s, document: { ...s.document, [key]: val } })), [])

  const setRule = useCallback((i: number, patch: Partial<ElementRule>) =>
    setStyleSettings(s => {
      const rules = [...s.rules]; rules[i] = { ...rules[i], ...patch }; return { ...s, rules }
    }), [])

  const addRule = useCallback(() =>
    setStyleSettings(s => ({ ...s, rules: [...s.rules, createDefaultRule()] })), [])

  const removeRule = useCallback((i: number) =>
    setStyleSettings(s => ({ ...s, rules: s.rules.filter((_, j) => j !== i) })), [])

  const resetStyles = useCallback(() => setStyleSettings(createDefaultSettings()), [])

  // Reveal the Files panel on upload so the user sees their files. The panel
  // remounts on open and defaults to the Files tab.
  const handleUploadFiles = useCallback((uploaded: { name: string; content: string }[]) => {
    loadFiles(uploaded)
    setStylesOpen(true)
  }, [loadFiles])

  const buildConfig = () => ({
    ...defaultExportConfig(title),
    themeId,
    styleSettings,
  })

  return (
    <div className="studio-root">
      <Toolbar
        title={title}
        onTitleChange={setTitle}
        stylesOpen={stylesOpen}
        onToggleStyles={() => setStylesOpen(o => !o)}
        onExportPDF={() => {
          if (!previewRef.current) return
          // The quick toolbar PDF button must route through the deck-specific export
          // (landscape 13.333in x 7.5in @page + Tailwind CSS carried over) when deck
          // mode is on — routing continuous exportToPDF's A4-portrait/no-Tailwind-CSS
          // path over deck markup was the actual cause of "portrait instead of
          // landscape, disastrous styling" (the Export Modal's dedicated "Slide Deck
          // (PDF)" button already called exportDeckToPDF correctly; this shortcut
          // button didn't check deckMode at all).
          if (deckMode) exportDeckToPDF(previewRef.current, buildConfig())
          else exportToPDF(previewRef.current, buildConfig())
        }}
        onExportHTML={() => previewRef.current && exportToHTML(previewRef.current, buildConfig())}
        onExportMarkdown={() => exportToMarkdown(content, title)}
        onUploadFiles={handleUploadFiles}
        deckMode={deckMode}
        onToggleDeckMode={() => setDeckMode(v => !v)}
        onOpenExportModal={() => setExportModalOpen(true)}
        onOpenDeckGuide={() => setDeckGuideOpen(true)}
      />

      <div className="flex flex-1 min-h-0">
        <CollapsiblePanel
          collapsed={editorCollapsed}
          onToggle={() => setEditorCollapsed(v => !v)}
          width="50%"
          labelExpand="Show editor"
          labelCollapse="Hide editor"
        >
          <EditorPane defaultValue={DEFAULT_CONTENT} onChange={updateContent} onMount={onEditorMount} />
        </CollapsiblePanel>
        <PreviewPane
          content={content}
          themeId={themeId}
          styleSettings={styleSettings}
          previewRef={previewRef}
          scrollRef={previewScrollRef}
          deckMode={deckMode}
        />
        <ExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          documentTitle={title}
          deckMode={deckMode}
          onExportPDF={(config: ExportConfig) => previewRef.current && exportToPDF(previewRef.current, config)}
          onExportHTML={(config: ExportConfig) => previewRef.current && exportToHTML(previewRef.current, config)}
          onExportDeck={(config: ExportConfig) => previewRef.current && exportDeckToPDF(previewRef.current, config)}
        />
        <SlideDeckGuide open={deckGuideOpen} onClose={() => setDeckGuideOpen(false)} />
        {stylesOpen && (
          <StylePanel
            themeId={themeId}
            styleSettings={styleSettings}
            files={files}
            activeId={activeId}
            onThemeChange={setThemeId}
            onDocChange={setDoc}
            onRuleChange={setRule}
            onAddRule={addRule}
            onRemoveRule={removeRule}
            onResetStyles={resetStyles}
            onSelectFile={selectFile}
            onRenameFile={renameFile}
            onRemoveFile={removeFile}
            onNewFile={newFile}
          />
        )}
      </div>
    </div>
  )
}
