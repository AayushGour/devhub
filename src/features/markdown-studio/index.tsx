import { useRef, useState, useCallback } from 'react'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import StylePanel from './components/StylePanel'
import { useMarkdownEditor } from './hooks/useMarkdownEditor'
import { exportToPDF, exportToHTML, exportToMarkdown, defaultExportConfig } from './utils/pdfExport'
import { createDefaultSettings, createDefaultRule, type StyleSettings, type ElementRule } from './utils/styleBuilder'

export default function MarkdownStudioPage() {
  const { content, title, setTitle, updateContent } = useMarkdownEditor()
  const previewRef = useRef<HTMLDivElement>(null)

  const [themeId, setThemeId] = useState('classic')
  const [styleSettings, setStyleSettings] = useState<StyleSettings>(createDefaultSettings)
  const [stylesOpen, setStylesOpen] = useState(false)

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

  const buildConfig = () => ({
    ...defaultExportConfig(title),
    themeId,
    styleSettings,
  })

  return (
    <div className="-my-8 -mx-10 flex flex-col h-full">
      <Toolbar
        title={title}
        onTitleChange={setTitle}
        stylesOpen={stylesOpen}
        onToggleStyles={() => setStylesOpen(o => !o)}
        onExportPDF={() => previewRef.current && exportToPDF(previewRef.current, buildConfig())}
        onExportHTML={() => previewRef.current && exportToHTML(previewRef.current, buildConfig())}
        onExportMarkdown={() => exportToMarkdown(content, title)}
      />

      <div className="flex flex-1 min-h-0">
        <EditorPane value={content} onChange={updateContent} />
        <PreviewPane
          content={content}
          themeId={themeId}
          styleSettings={styleSettings}
          previewRef={previewRef}
        />
        {stylesOpen && (
          <StylePanel
            themeId={themeId}
            styleSettings={styleSettings}
            onThemeChange={setThemeId}
            onDocChange={setDoc}
            onRuleChange={setRule}
            onAddRule={addRule}
            onRemoveRule={removeRule}
            onResetStyles={resetStyles}
          />
        )}
      </div>
    </div>
  )
}
