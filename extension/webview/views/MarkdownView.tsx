import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, FileCode, Printer } from 'lucide-react'
import PreviewPane from '@/features/markdown-studio/components/PreviewPane'
import { createDefaultSettings } from '@/features/markdown-studio/utils/styleBuilder'
import { THEMES } from '@/features/markdown-studio/utils/themes'
import { exportToHTML, exportToMarkdown, defaultExportConfig, getExportHTML } from '@/features/markdown-studio/utils/pdfExport'
import { exportPDFViaHost } from '../utils/print'
import { getVsCodeApi } from '../vscode-api'

const DEFAULT_STYLE = createDefaultSettings()
const SELECT_CLS =
  'bg-surface-raised border border-border rounded-md px-2 py-1 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'

// "Match VS Code" — overrides the markdown paper (which the shared component
// forces light) so it follows the editor's own theme colors.
const VSCODE_STYLE_ID = 'devhub-md-vscode'
const VSCODE_OVERRIDE = `
.markdown-preview {
  background: var(--vscode-editor-background) !important;
  color: var(--vscode-editor-foreground) !important;
  box-shadow: none !important;
}
.markdown-preview h1, .markdown-preview h2, .markdown-preview h3,
.markdown-preview h4, .markdown-preview h5, .markdown-preview h6,
.markdown-preview p, .markdown-preview li, .markdown-preview td,
.markdown-preview th, .markdown-preview strong, .markdown-preview em {
  color: var(--vscode-editor-foreground) !important;
}
.markdown-preview a { color: var(--vscode-textLink-foreground) !important; }
.markdown-preview code, .markdown-preview pre {
  background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12)) !important;
  color: var(--vscode-editor-foreground) !important;
}
.markdown-preview pre code { background: transparent !important; }
.markdown-preview blockquote {
  color: var(--vscode-descriptionForeground) !important;
  border-left-color: var(--vscode-panel-border, rgba(127,127,127,0.4)) !important;
  background: transparent !important;
}
.markdown-preview table th, .markdown-preview table td {
  border-color: var(--vscode-panel-border, rgba(127,127,127,0.3)) !important;
}
.markdown-preview hr { border-color: var(--vscode-panel-border, rgba(127,127,127,0.3)) !important; }

/* Recolour embedded Mermaid diagrams to the editor theme (the shared renderer
   bakes in a light palette that is invisible on a dark paper). */
.markdown-preview pre.mermaid { background: transparent !important; padding: 0 !important; }
.markdown-preview .mermaid svg .node rect,
.markdown-preview .mermaid svg .node circle,
.markdown-preview .mermaid svg .node ellipse,
.markdown-preview .mermaid svg .node polygon,
.markdown-preview .mermaid svg .node path,
.markdown-preview .mermaid svg .cluster rect {
  fill: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.16)) !important;
  stroke: var(--vscode-focusBorder, #569cd6) !important;
}
.markdown-preview .mermaid svg .nodeLabel,
.markdown-preview .mermaid svg .edgeLabel,
.markdown-preview .mermaid svg .cluster text,
.markdown-preview .mermaid svg span,
.markdown-preview .mermaid svg text,
.markdown-preview .mermaid svg .label {
  color: var(--vscode-editor-foreground) !important;
  fill: var(--vscode-editor-foreground) !important;
}
.markdown-preview .mermaid svg .edgePath path,
.markdown-preview .mermaid svg .flowchart-link,
.markdown-preview .mermaid svg .messageLine0,
.markdown-preview .mermaid svg .messageLine1 {
  stroke: var(--vscode-editor-foreground) !important;
}
.markdown-preview .mermaid svg .edgeLabel,
.markdown-preview .mermaid svg .edgeLabel rect {
  background-color: var(--vscode-editor-background) !important;
  fill: var(--vscode-editor-background) !important;
}
.markdown-preview .mermaid svg marker path,
.markdown-preview .mermaid svg .arrowheadPath,
.markdown-preview .mermaid svg .arrowMarkerPath {
  fill: var(--vscode-editor-foreground) !important;
  stroke: var(--vscode-editor-foreground) !important;
}
`

const MATCH_VSCODE = 'vscode'

export default function MarkdownView({ text }: { text: string; colorTheme: 'light' | 'dark' }) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [themeId, setThemeId] = useState<string>(MATCH_VSCODE)

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    e.preventDefault()
    if (href.match(/^https?:/)) {
      getVsCodeApi().postMessage({ type: 'openExternal', href })
    } else if (href.startsWith('#')) {
      const id = href.slice(1)
      const el = document.getElementById(id) ?? document.querySelector(`[name="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth' })
    } else {
      getVsCodeApi().postMessage({ type: 'navigate', href })
    }
  }, [])

  // Toggle the VS Code colour override stylesheet based on the selection.
  useEffect(() => {
    let el = document.getElementById(VSCODE_STYLE_ID) as HTMLStyleElement | null
    if (themeId === MATCH_VSCODE) {
      if (!el) {
        el = document.createElement('style')
        el.id = VSCODE_STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = VSCODE_OVERRIDE
    } else {
      el?.remove()
    }
  }, [themeId, text])

  // When matching VS Code, take colours from the editor (via the override above)
  // but keep Emerald's fonts/structure.
  const renderThemeId = themeId === MATCH_VSCODE ? 'emerald' : themeId

  const buildExportConfig = () => ({
    ...defaultExportConfig('document'),
    themeId: renderThemeId,
    styleSettings: DEFAULT_STYLE,
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
          Theme
        </span>
        <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className={SELECT_CLS}>
          <option value={MATCH_VSCODE}>Match VS Code</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            data-tooltip="Export Markdown (.md)"
            onClick={() => exportToMarkdown(text, 'document')}
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
          >
            <FileText size={14} />
          </button>
          <button
            data-tooltip="Export HTML"
            onClick={() => previewRef.current && exportToHTML(previewRef.current, buildExportConfig())}
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
          >
            <FileCode size={14} />
          </button>
          <button
            data-tooltip="Export PDF"
            onClick={() => previewRef.current && exportPDFViaHost(getExportHTML(previewRef.current, buildExportConfig()), 'document')}
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
          >
            <Printer size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0" onClick={handleLinkClick}>
        <PreviewPane
          content={text}
          themeId={renderThemeId}
          styleSettings={DEFAULT_STYLE}
          previewRef={previewRef}
        />
      </div>
    </div>
  )
}
