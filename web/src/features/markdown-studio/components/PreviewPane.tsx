import { useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { parseMarkdown, postProcessPreview } from '../utils/parser'
import { initMermaid, renderMermaidBlocks } from '../utils/mermaidHelper'
import { themeToCss, buildCustomCss, type StyleSettings } from '../utils/styleBuilder'
import { getTheme, GOOGLE_FONTS_URL, FONTSHARE_URL } from '../utils/themes'
import { useSettingsStore } from '@/store/settingsStore'
import SlideDeckPreview from './SlideDeckPreview'

interface PreviewPaneProps {
  content: string
  themeId: string
  styleSettings: StyleSettings
  previewRef: React.RefObject<HTMLDivElement | null>
  scrollRef?: (node: HTMLDivElement | null) => void
  // Deck mode (D1): renders SlideDeckPreview (a React tree) inside the same previewRef
  // node instead of the imperative innerHTML render below. Export still reads
  // previewRef.current.innerHTML either way — the ref contract is unchanged.
  deckMode?: boolean
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

// This <style> is injected GLOBALLY into <head>, so it targets every
// `.markdown-preview` on the page — including MCP Studio's result pane, which
// reuses the shared MarkdownViewer. Scope it to `:not(.mcp-result)` so the fixed
// light-paper palette (dark #24292e text + per-theme heading colors below) never
// leaks onto that pane, whose `.mcp-result` rules make it follow the app theme.
const PREVIEW_SCOPE = '.markdown-preview:not(.mcp-result)'

// Ensures the preview always renders with a light document background regardless of
// app theme, matching the PDF export appearance. User custom styles override this.
const BASE_PREVIEW_CSS = `${PREVIEW_SCOPE} { color: #24292e; }`

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
    themeToCss(theme, PREVIEW_SCOPE),
    buildCustomCss(settings, PREVIEW_SCOPE),
  ].join('\n')
}

export default function PreviewPane({ content, themeId, styleSettings, previewRef, scrollRef, deckMode }: PreviewPaneProps) {
  const { theme: appTheme } = useSettingsStore()
  const innerRef = useRef<HTMLDivElement>(null)

  // Merged ref callback: points both the local innerRef (used by the imperative
  // continuous-mode render below) and the parent-provided previewRef (export reads its
  // innerHTML) at the current preview node. A single stable callback used by the one
  // preview element — its `key` toggles with deckMode so React fully remounts the node
  // on a mode switch (see the comment on that element).
  const setPreviewNode = useCallback((el: HTMLDivElement | null) => {
    innerRef.current = el
    ;(previewRef as React.MutableRefObject<HTMLDivElement | null>).current = el
  }, [previewRef])

  const renderContent = useCallback(async () => {
    // MUST bail in deck mode. innerRef points at the same node in both modes (see
    // setPreviewNode), and in deck mode that node is React-owned — its children are the
    // SlideDeckPreview tree. Without this guard, the imperative `el.innerHTML = …` below
    // would clobber that React tree with continuous-mode markdown, leaving the deck
    // preview blank with stale continuous HTML in its place.
    if (deckMode) return
    const el = innerRef.current
    if (!el) return
    el.innerHTML = parseMarkdown(content)
    const { hasMermaid } = postProcessPreview(el)
    if (hasMermaid) {
      initMermaid(appTheme)
      await renderMermaidBlocks(el)
    }
  }, [content, appTheme, deckMode])

  useEffect(() => { renderContent() }, [renderContent])

  useEffect(() => {
    ensureFontsLoaded()
    injectThemeCss(themeId, styleSettings)
  }, [themeId, styleSettings])

  return (
    <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto border-l border-border bg-surface">
      {/* previewRef = this content div — export reads its innerHTML directly, in both
          continuous mode (imperative .md-content render) and deck mode (.slide-page
          React stack). The `key` toggles with deckMode so React fully unmounts+remounts
          the node on a mode switch rather than reusing it in place: without that, the
          same-type ('div') element would be reused, leaving stale imperative
          continuous-mode HTML sitting next to the freshly-mounted SlideDeckPreview tree
          (React doesn't manage DOM it didn't create, so on reuse it appends its own
          children beside the stale nodes instead of replacing them).

          The `markdown-preview` class is applied ONLY in continuous mode. In deck mode
          it's deliberately omitted: injectThemeCss() injects a GLOBAL
          `.markdown-preview h1,h2,h3 { color: … }` rule (the doc theme's fixed heading
          colors, for continuous content). With every slide title nested under this
          wrapper, that class made the doc-theme heading color win over each slide's own
          (often dark-background) styling — illegible titles unless the slide set an
          explicit style.title.color. Same container utilities either way. */}
      <div
        key={deckMode ? 'deck' : 'continuous'}
        ref={setPreviewNode}
        className={cn(
          'rounded-lg shadow-[0_0.06rem_0.25rem_rgba(0,0,0,0.12)] min-h-full p-4',
          !deckMode && 'markdown-preview'
        )}
        style={{ backgroundColor: APP_THEME_PREVIEW_BG[appTheme] ?? '#ffffff' }}
      >
        {deckMode && <SlideDeckPreview content={content} />}
      </div>
    </div>
  )
}
