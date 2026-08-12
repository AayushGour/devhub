// Slide Deck export — extends the pdfExport.ts window.open + window.print() mechanism
// with deck-specific @page sizing/page-breaks. See project-context.md ## Export + D1.
//
// Design note (D1): the in-app deck preview is a React tree (SlideDeckPreview ->
// SlideCard -> SLIDE_LAYOUTS[type]), not an HTML string built here. Rather than
// re-render slides as strings (which would force string-concatenated per-slide CSS,
// violating the "React style object, never string CSS" guardrail), export reads the
// ALREADY-RENDERED deck DOM via `previewEl.innerHTML` — exactly like exportToPDF does
// for continuous mode. Each .slide-page in that DOM already carries its resolved
// per-slide inline style (from slideStyleToReactStyle) baked in by React, so this file
// only needs to wrap that markup in a print document and run overflow measurement.
import { GOOGLE_FONTS_URL, FONTSHARE_URL } from './themes'
import type { ExportConfig } from './pdfExport'
import { measureAndScale } from './slideOverflow'

// True 16:9 PPTX slide dimensions (project-context.md AC), not generic A4-landscape.
const SLIDE_PAGE_CSS = `
  /* NOTE: intentionally NOT resetting margin/padding on the universal selector here.
     The injected app stylesheet (collectAppStylesheetCss) carries Tailwind's own
     preflight for element resets, and — critically — Tailwind v4 emits its utilities
     inside \`@layer utilities\`. An UNLAYERED rule (like everything in this string) beats
     any layered rule regardless of specificity, so a \`* { padding: 0 }\` here would
     silently override every \`p-8\`/\`gap-*\` utility the slide layouts rely on (that was
     the "later slides have no padding" bug). box-sizing is safe to keep since it
     matches what utilities assume. */
  *, *::before, *::after { box-sizing: border-box; }
  @page { size: 13.333in 7.5in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  .slide-page {
    width: 13.333in;
    height: 7.5in;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slide-page:last-child { page-break-after: auto; }
  .slide-page__content {
    width: 100%;
    height: 100%;
    transform-origin: top left;
  }
  /* The footer element is rendered by SlideCard with cqw-based Tailwind classes (which
     scale with the slide box) and carries its own absolute positioning — so there is
     deliberately NO .slide-page__footer rule here. A fixed-px rule (this string is
     unlayered and would beat the layered utilities) previously pinned the footer to a
     fixed size that didn't scale with the page. */
  /* notes are stripped entirely before this doc is built — never emitted */
  img { max-width: 100%; }
  /* Inline markdown images (body/columns/caption) additionally get a height cap so a
     tall/portrait image can't overflow the fixed-height print page — mirrors
     SlideCard.css's preview rule (em-based, scales with the slide the same way title/
     body text does). Scoped to .markdown-preview img only — does NOT touch
     image-focus's dedicated image field, which is already correctly bounded by its
     own flex parent's max-h-full (a real Tailwind class, present via
     collectAppStylesheetCss() above). */
  .markdown-preview img { max-height: 18em; object-fit: contain; width: auto; }
  table { border-collapse: collapse; width: 100%; }
  /* em padding so cells scale with the slide's container-relative base font. */
  th, td { border: 1px solid #dfe2e5; padding: 0.3em 0.6em; }
  .mermaid-block { text-align: center; }
  .mermaid-block svg { max-width: 100%; height: auto; }

  /* SlideCard's on-screen preview constrains .slide-card to a scrollable, centered
     card (max-w-4xl mx-auto) sized for the studio's preview pane. In print, it must
     fill its .slide-page parent (already forced to the true 13.333in x 7.5in slide
     box above) instead of sitting as a small centered card on an oversized page.
     Higher specificity than Tailwind's own single-class rules so it wins regardless
     of source order. */
  .slide-page .slide-card {
    max-width: none;
    width: 100%;
    height: 100%;
    margin: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  /* SlideDeckPreview's on-screen wrapper adds gap-6/p-6 (Tailwind) to space cards out
     while scrolling the preview pane. That spacing has no place in the print flow —
     page-break-after already separates pages, and the wrapper's own padding/gap
     otherwise leaks in as extra blank space around/between printed pages. Same
     specificity as the Tailwind utilities it's overriding (single class selector);
     wins because this stylesheet loads after the app's Tailwind CSS in the doc head. */
  .slide-deck-stack {
    gap: 0;
    padding: 0;
  }
`

// Deck slides are styled entirely with Tailwind utility classes on the in-app DOM
// (flex layouts, aspect-ratio, spacing, the --surface/--border/etc. custom properties
// — mandated by CLAUDE.md's Tailwind-first rule), unlike continuous mode's semantic-
// HTML markdown output (pdfExport.ts's BASE_CONTENT_CSS covers that by hand). This
// window.open'd print document starts with none of that CSS, so every utility class
// resolves to nothing unless the app's actual live stylesheets are carried over.
// Reading document.styleSheets pulls in exactly what's rendering the on-screen
// preview right now — dev-mode's injected <style> tags or the prod CSS bundle, plus
// companion component .css files — so there's no separate Tailwind subset to
// hand-maintain and no risk of it drifting from the preview.
function collectAppStylesheetCss(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules
      if (!rules) continue
      chunks.push(Array.from(rules).map((r) => r.cssText).join('\n'))
    } catch {
      // Cross-origin stylesheet (e.g. the Google Fonts <link>) — cssRules access
      // throws a SecurityError. Fonts are already linked separately below; skip.
    }
  }
  return chunks.join('\n')
}

// Preview-only chrome that must never reach the exported PDF, same guarantee as
// `notes` (which are never written into the DOM at all — see SlideCard). Unlike
// notes, the overflow badge IS a live runtime DOM element (SlideCard renders it
// conditionally when clipped), so it needs an explicit stripping step here rather
// than relying on "never rendered in the first place". Stable class hook set in
// SlideCard.tsx's overflow badge `<span>`.
const STRIP_SELECTORS = '.slide-overflow-badge'

/**
 * Removes preview-only chrome (currently just the overflow badge) from already-rendered
 * deck markup before it's serialized into the print document, mirroring how `notes` are
 * kept out of exported output (there, by never being rendered into the DOM at all).
 */
function stripPreviewOnlyChrome(deckHtml: string): string {
  const doc = new DOMParser().parseFromString(`<div id="__root">${deckHtml}</div>`, 'text/html')
  doc.querySelectorAll(STRIP_SELECTORS).forEach(el => el.remove())
  return doc.getElementById('__root')?.innerHTML ?? deckHtml
}

/**
 * Builds the print document string for a slide deck. `deckHtml` is the already-rendered
 * deck markup (e.g. `previewEl.innerHTML`) — a sequence of `.slide-page` elements with
 * their per-slide inline styles/footers already baked in by the React render (SlideCard).
 * This function does NOT parse markdown or apply per-slide config — that already
 * happened in the React tree; it only strips preview-only chrome (the overflow badge)
 * and wraps the remaining markup in a landscape print doc.
 */
export function buildSlidePrintDoc(deckHtml: string, config: ExportConfig): string {
  const cleanedHtml = stripPreviewOnlyChrome(deckHtml)
  // Carry the app's current theme onto the export doc's <html>. The theme CSS custom
  // properties (--surface, --on-surface, etc.) are defined under `[data-theme="…"]`
  // selectors (index.css), and slides without an explicit style.background inherit
  // bg-surface/text-on-surface from them. Without this, the export doc's <html> has no
  // data-theme, those vars fall back to the light defaults, and every themed slide
  // renders light while the preview (which runs under the app's data-theme) shows the
  // selected theme — the preview↔export mismatch.
  const themeAttr = document.documentElement.getAttribute('data-theme') || 'light'
  return `<!DOCTYPE html>
<html lang="en" data-theme="${themeAttr}">
<head>
  <meta charset="UTF-8">
  <title>${config.coverTitle || 'Slide Deck'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
  <link href="${FONTSHARE_URL}" rel="stylesheet">
  <style>${collectAppStylesheetCss()}</style>
  <style>${SLIDE_PAGE_CSS}</style>
</head>
<body>
  ${cleanedHtml}
</body>
</html>`
}

// Runs the shared overflow measure/scale on every rendered slide page in `doc`,
// applying `transform: scale(f)` (and `overflow:hidden` on clip) so the printed
// output matches what preview showed (minus the preview-only overflow badge, which
// SlideCard never writes into exported markup in the first place).
function applyOverflowScaling(doc: Document) {
  doc.querySelectorAll<HTMLElement>('.slide-page').forEach(page => {
    const contentEl = page.querySelector<HTMLElement>('.slide-page__content')
    if (!contentEl) return
    const { scale, clipped } = measureAndScale(contentEl, page.clientHeight || page.offsetHeight)
    // Always assign (not just when scale !== 1): the serialized HTML may already carry
    // a transform baked in from the on-screen preview's smaller box, which must be
    // cleared here even when the true print-size box needs no scaling at all.
    contentEl.style.transform = scale !== 1 ? `scale(${scale})` : ''
    if (clipped) page.style.overflow = 'hidden'
  })
}

/**
 * Exports the deck DOM (read from `previewEl`, which already excludes `notes` — those
 * are never rendered into the preview DOM by SlideCard — and already has per-slide
 * footer/style baked in) as a landscape slide-deck PDF. Mirrors exportToPDF's
 * window.open + write + fonts.ready + print pattern (utils/pdfExport.ts).
 */
export function exportDeckToPDF(previewEl: HTMLElement, config: ExportConfig) {
  const win = window.open('', '_blank')
  if (!win) { alert('Allow popups to export PDF.'); return }
  win.document.write(buildSlidePrintDoc(previewEl.innerHTML, config))
  win.document.close()

  const runPrint = () => {
    applyOverflowScaling(win.document)
    win.print()
    win.close()
  }

  win.onload = () => {
    win.document.fonts.ready.then(() => {
      setTimeout(runPrint, 300)
    })
  }
  setTimeout(() => { if (!win.closed) runPrint() }, 2000)
}
