import { useEffect, useRef, useCallback } from 'react'
import { parseMarkdown, postProcessPreview } from '../utils/parser'
import { initMermaid, renderMermaidBlocks } from '../utils/mermaidHelper'
import { themeToCss, buildCustomCss, type StyleSettings } from '../utils/styleBuilder'
import { getTheme, GOOGLE_FONTS_URL, FONTSHARE_URL } from '../utils/themes'
import { useSettingsStore } from '@/store/settingsStore'

interface PreviewPaneProps {
  content: string
  themeId: string
  styleSettings: StyleSettings
  previewRef: React.RefObject<HTMLDivElement | null>
}

const FONT_LINK_ID = 'devhub-google-fonts'
const THEME_STYLE_ID = 'devhub-preview-theme-css'

const APP_THEME_PREVIEW_BG: Record<string, string> = {
  light: '#ffffff',
  dark: '#efefef',
  github: '#edf2f8',
  nord: '#dce3ef',
  dracula: '#eee9fa',
}

function ensureFontsLoaded() {
  if (!document.getElementById(FONT_LINK_ID)) {
    const gf = document.createElement('link')
    gf.id = FONT_LINK_ID; gf.rel = 'stylesheet'; gf.href = GOOGLE_FONTS_URL
    document.head.appendChild(gf)
    const fs = document.createElement('link')
    fs.rel = 'stylesheet'; fs.href = FONTSHARE_URL
    document.head.appendChild(fs)
  }
}

// Ensures the preview always renders with a light document background regardless of
// app theme, matching the PDF export appearance. User custom styles override this.
const BASE_PREVIEW_CSS = `.markdown-preview { color: #24292e; }`

function injectThemeCss(themeId: string, settings: StyleSettings) {
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = THEME_STYLE_ID
    document.head.appendChild(el)
  }
  const theme = getTheme(themeId)
  el.textContent = [
    BASE_PREVIEW_CSS,
    themeToCss(theme, '.markdown-preview'),
    buildCustomCss(settings, '.markdown-preview'),
  ].join('\n')
}

export default function PreviewPane({ content, themeId, styleSettings, previewRef }: PreviewPaneProps) {
  const { theme: appTheme } = useSettingsStore()
  const innerRef = useRef<HTMLDivElement>(null)

  const renderContent = useCallback(async () => {
    const el = innerRef.current
    if (!el) return
    el.innerHTML = parseMarkdown(content)
    const { hasMermaid } = postProcessPreview(el)
    if (hasMermaid) {
      initMermaid(appTheme)
      await renderMermaidBlocks(el)
    }
  }, [content, appTheme])

  useEffect(() => { renderContent() }, [renderContent])

  useEffect(() => {
    ensureFontsLoaded()
    injectThemeCss(themeId, styleSettings)
  }, [themeId, styleSettings])

  return (
    <div className="flex-1 min-w-0 overflow-auto border-l border-border bg-surface">
      {/* previewRef = inner content div — export reads innerHTML directly into .md-content wrapper */}
      <div
        ref={(el) => { innerRef.current = el; (previewRef as React.MutableRefObject<HTMLDivElement | null>).current = el }}
        className="markdown-preview rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.12)] min-h-full p-4"
        style={{ backgroundColor: APP_THEME_PREVIEW_BG[appTheme] ?? '#ffffff' }}
      />
    </div>
  )
}
