import { getTheme, GOOGLE_FONTS_URL, FONTSHARE_URL } from './themes'
import { themeToCss, buildCustomCss } from './styleBuilder'
import type { StyleSettings } from './styleBuilder'

export interface ExportConfig {
  themeId: string
  styleSettings: StyleSettings
  coverPage: boolean
  coverTitle: string
  coverSubtitle: string
  coverAuthor: string
  coverDate: string
  showHeader: boolean
  headerLeft: string
  headerCenter: string
  headerRight: string
  showFooter: boolean
  footerPageNumbers: boolean
  watermark: string
  // Deck-level footer text fields (D5) — additive only. Continuous-mode buildPrintDoc
  // never reads these; they exist so per-slide `footer.left/center/right` overrides
  // (slideExport.ts) have deck-level values to field-merge over via mergeFooter.
  footerLeft?: string
  footerCenter?: string
  footerRight?: string
}

export function defaultExportConfig(docTitle = ''): ExportConfig {
  return {
    themeId: 'classic',
    styleSettings: {
      document: { fontFamily: '', color: '', backgroundColor: '', borderWidth: '', borderStyle: '', borderColor: '', borderRadius: '', padding: '' },
      rules: [],
    },
    coverPage: false,
    coverTitle: docTitle,
    coverSubtitle: '',
    coverAuthor: '',
    coverDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    showHeader: false,
    headerLeft: '',
    headerCenter: docTitle,
    headerRight: '',
    showFooter: true,
    footerPageNumbers: true,
    watermark: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
  }
}

// Base resets only — no colors/fonts. Theme + custom CSS layer on top.
const BASE_CONTENT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  /* .md-content is the root for all user styles.
     Targeting a div (not body) ensures background/border render in print. */
  .md-content {
    font-size: 16px;
    color: #24292e;
    background: #fff;
    min-height: 100%;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1,h2,h3,h4,h5,h6 { font-weight: 600; line-height: 1.25; margin-top: 1.4em; margin-bottom: 0.5em; }
  h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  h3 { font-size: 1.25em; }
  p { margin: 0 0 1em; }
  a { color: #0366d6; }
  ul,ol { padding-left: 2em; margin: 0 0 1em; }
  li { margin: 3px 0; }
  blockquote { border-left: 4px solid #dfe2e5; padding: 0 1em; color: #6a737d; margin: 0 0 1em; }
  code { font-family: 'JetBrains Mono', 'Fira Code', SFMono-Regular, Consolas, monospace; font-size: 85%; background: rgba(27,31,35,.05); padding: 0.2em 0.4em; border-radius: 3px; }
  pre { background: #f6f8fa; border-radius: 8px; padding: 16px; overflow: auto; margin: 0 0 1em; }
  pre code { background: none; padding: 0; font-size: 0.875em; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 1em; }
  th,td { border: 1px solid #dfe2e5; padding: 6px 13px; }
  th { background: #f6f8fa; font-weight: 600; }
  tr:nth-child(even) td { background: #f6f8fa; }
  img { max-width: 100%; border-radius: 6px; }
  hr { border: none; border-top: 1px solid #eaecef; margin: 1.5em 0; }
  .mermaid-block { margin: 1.5em 0; text-align: center; }
  .mermaid-block svg { max-width: 100%; height: auto; }
`

// @page must be top-level, not inside @media
const PAGE_RULE = `@page { margin: 0; size: A4; }`

function buildPrintDoc(html: string, config: ExportConfig): string {
  const theme = getTheme(config.themeId)
  // .md-content is the content wrapper div.
  // Document-level (bg, border, padding) targets the wrapper — NOT body —
  // because browsers suppress body{background} in print even with print-color-adjust.
  // Element rules like '.md-content h1' have proper specificity over base resets.
  const themeCss = themeToCss(theme, '.md-content')
  const customCss = buildCustomCss(config.styleSettings, '.md-content')

  const watermarkCss = config.watermark ? `
    body::before {
      content: "${config.watermark}";
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%,-50%) rotate(-35deg);
      font-size: 80px; font-weight: 700; opacity: 0.06;
      color: #000; pointer-events: none; z-index: 0;
      white-space: nowrap; letter-spacing: 8px; text-transform: uppercase;
    }` : ''

  const coverHtml = config.coverPage ? `
    <div style="display:flex;flex-direction:column;justify-content:center;min-height:100vh;page-break-after:always;text-align:center;padding:80px 40px;">
      <div style="max-width:520px;margin:0 auto;">
        <h1 style="font-size:40px;font-weight:600;letter-spacing:-0.5px;margin-bottom:20px;color:#1a1a2e;border:none;">${config.coverTitle || 'Document'}</h1>
        ${config.coverSubtitle ? `<p style="font-size:20px;color:#555;margin-bottom:48px;">${config.coverSubtitle}</p>` : ''}
        <div style="margin-top:auto;padding-top:48px;border-top:1px solid #e0e0e0;">
          ${config.coverAuthor ? `<p style="font-size:15px;font-weight:600;color:#333;margin-bottom:6px;">${config.coverAuthor}</p>` : ''}
          ${config.coverDate ? `<p style="font-size:13px;color:#666;">${config.coverDate}</p>` : ''}
        </div>
      </div>
    </div>` : ''

  const headerHtml = config.showHeader ? `
    <div style="display:none;" class="print-header">
      <span>${config.headerLeft}</span>
      <span>${config.headerCenter}</span>
      <span>${config.headerRight}</span>
    </div>` : ''

  const pageCSS = `
    ${PAGE_RULE}
    ${config.showFooter && config.footerPageNumbers ? `
    @page {
      margin: ${config.showHeader ? '18mm' : '20mm'} 18mm ${config.showFooter ? '18mm' : '20mm'};
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 10px; color: #6e6e73; font-family: system-ui, sans-serif; }
      ${config.showHeader && config.headerCenter ? `@top-center { content: "${config.headerCenter}"; font-size: 10px; color: #6e6e73; font-family: system-ui, sans-serif; }` : ''}
    }` : ''}
    .print-header { display: none; }
    @media print {
      ${config.showHeader ? `.print-header { display: flex; position: fixed; top: 0; left: 0; right: 0; justify-content: space-between; padding: 10px 40px; font-size: 10px; color: #6e6e73; border-bottom: 1px solid #e0e0e0; background: #fff; }` : ''}
    }
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${config.coverTitle || 'Document'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
  <link href="${FONTSHARE_URL}" rel="stylesheet">
  <style>
    ${BASE_CONTENT_CSS}
    ${themeCss}
    ${customCss}
    ${watermarkCss}
    ${pageCSS}
  </style>
</head>
<body>
  ${coverHtml}
  ${headerHtml}
  <div class="md-content">${html}</div>
</body>
</html>`
}

export function getExportHTML(previewEl: HTMLElement, config: ExportConfig): string {
  return buildPrintDoc(previewEl.innerHTML, config)
}

export function exportToPDF(previewEl: HTMLElement, config: ExportConfig) {
  const win = window.open('', '_blank')
  if (!win) { alert('Allow popups to export PDF.'); return }
  win.document.write(buildPrintDoc(previewEl.innerHTML, config))
  win.document.close()
  // Wait for fonts to load before printing
  win.onload = () => {
    win.document.fonts.ready.then(() => {
      setTimeout(() => { win.print(); win.close() }, 300)
    })
  }
  setTimeout(() => { if (!win.closed) { win.print(); win.close() } }, 2000)
}

export function exportToHTML(previewEl: HTMLElement, config: ExportConfig) {
  const blob = new Blob([buildPrintDoc(previewEl.innerHTML, config)], { type: 'text/html' })
  downloadBlob(blob, `${config.coverTitle || 'document'}.html`)
}

export function exportToMarkdown(content: string, title: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  downloadBlob(blob, `${title || 'document'}.md`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
