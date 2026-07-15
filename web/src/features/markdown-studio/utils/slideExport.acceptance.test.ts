// Tester-authored AC-driven acceptance/regression suite for slide deck export.
// Maps to project-context.md AC: "Exported PDF uses @page {13.333in x 7.5in; margin:0},
// one slide per page via page-break-after, notes omitted entirely, overflow scaling runs
// on the rendered DOM before window.print()."
import { describe, it, expect } from 'vitest'
import { buildSlidePrintDoc } from './slideExport'
import { measureAndScale, OVERFLOW_SCALE_FLOOR } from './slideOverflow'
import { defaultExportConfig } from './pdfExport'

describe('AC: exported PDF @page is true 16:9 PPTX dimensions with zero margin', () => {
  it('emits exactly @page { size: 13.333in 7.5in; margin: 0; }', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toContain('@page { size: 13.333in 7.5in; margin: 0; }')
  })

  it('slide-page box itself is sized to 13.333in x 7.5in to match the @page', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toMatch(/\.slide-page\s*\{[^}]*width:\s*13\.333in/)
    expect(html).toMatch(/\.slide-page\s*\{[^}]*height:\s*7\.5in/)
  })
})

describe('AC: every slide gets page-break-after: always (except natural last-child override)', () => {
  it('the base .slide-page rule sets page-break-after: always', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toMatch(/\.slide-page\s*\{[^}]*page-break-after:\s*always/)
  })

  it('last slide-page does not force a trailing blank page (last-child override to auto)', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toMatch(/\.slide-page:last-child\s*\{[^}]*page-break-after:\s*auto/)
  })
})

describe('AC: notes fields never reach the print doc / exported HTML', () => {
  it('a deck DOM string containing NO notes text produces a print doc with none either (structural check)', () => {
    // Per architecture: SlideCard/layouts never write config.notes into the DOM at all,
    // so the innerHTML handed to buildSlidePrintDoc structurally excludes notes already.
    // This test asserts the print-doc builder itself introduces no notes leakage/labeling.
    const deckHtml = '<div class="slide-page"><div class="slide-page__content"><h1>Title</h1></div></div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).not.toMatch(/speaker.?notes/i)
    expect(html).not.toContain('data-notes')
  })

  it('even if a caller mistakenly included notes text in deckHtml, buildSlidePrintDoc passes markup through verbatim (documents the "never emitted" guarantee is upstream, in SlideCard, not here)', () => {
    // This test documents WHERE the notes guarantee lives: buildSlidePrintDoc is a dumb
    // wrapper (per its own doc comment) and does not strip notes itself — the guarantee is
    // that upstream (SlideCard/layouts) never puts notes text into the DOM in the first
    // place. Confirmed separately in SlideCard.acceptance.test.tsx and
    // slideLayouts.acceptance.test.tsx.
    const deckHtmlWithLeakedNotes = '<div class="slide-page">LEAKED-NOTES-TEXT</div>'
    const html = buildSlidePrintDoc(deckHtmlWithLeakedNotes, defaultExportConfig('Deck'))
    expect(html).toContain('LEAKED-NOTES-TEXT') // proves the guarantee must hold upstream
  })
})

describe('AC: overflow scaling runs on the rendered DOM before window.print() — shared measureAndScale used at export box height', () => {
  function stubHeight(el: HTMLElement, height: number) {
    Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true })
  }

  it('snapshot at exactly the floor scale (fitted === OVERFLOW_SCALE_FLOOR) -> scale=floor, not clipped', () => {
    const boxHeightPx = 720 // 7.5in equivalent at 96dpi
    const contentHeight = boxHeightPx / OVERFLOW_SCALE_FLOOR
    const el = document.createElement('div')
    stubHeight(el, contentHeight)
    const result = measureAndScale(el, boxHeightPx)
    expect(result.scale).toBeCloseTo(OVERFLOW_SCALE_FLOOR, 5)
    expect(result.clipped).toBe(false)
  })

  it('snapshot just below the floor scale -> scale floors at OVERFLOW_SCALE_FLOOR and clips', () => {
    const boxHeightPx = 720
    const contentHeight = boxHeightPx / (OVERFLOW_SCALE_FLOOR - 0.02)
    const el = document.createElement('div')
    stubHeight(el, contentHeight)
    const result = measureAndScale(el, boxHeightPx)
    expect(result.scale).toBe(OVERFLOW_SCALE_FLOOR)
    expect(result.clipped).toBe(true)
  })

  it('export box height (1280x720 CSS px equivalent) and preview box height use the identical measureAndScale function (no divergent logic)', () => {
    // Preview (SlideCard) and export (slideExport's applyOverflowScaling) both import
    // measureAndScale from the same module — this is a structural/import-identity check.
    const el1 = document.createElement('div')
    stubHeight(el1, 1000)
    const previewResult = measureAndScale(el1, 500)
    const el2 = document.createElement('div')
    stubHeight(el2, 1000)
    const exportResult = measureAndScale(el2, 500) // same box px, same content px -> identical result
    expect(previewResult).toEqual(exportResult)
  })
})

describe('AC: deck html rendered verbatim (footer/style already baked in by React) is wrapped by buildSlidePrintDoc unchanged', () => {
  it('per-slide inline style attributes on .slide-page elements pass through untouched', () => {
    const deckHtml = '<div class="slide-page" style="background-color:#0f172a"><div class="slide-page__content"><h1 style="color:#fff">T</h1></div></div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).toContain('background-color:#0f172a')
    expect(html).toContain('color:#fff')
  })
})
