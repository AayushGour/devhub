// Tester-authored regression suite (critical): continuous-mode (non-deck) export must be
// completely unaffected by the Slide Deck Export feature additions. Maps to
// project-context.md Constraints: "Existing continuous-mode (non-slide) markdown export
// must be unaffected — regression risk on parser.ts/pdfExport.ts's current A4 path."
import { describe, it, expect, vi } from 'vitest'
import { getExportHTML, exportToPDF, defaultExportConfig } from './pdfExport'
import * as slideExportModule from './slideExport'

describe('REGRESSION: continuous-mode buildPrintDoc still emits A4 @page, unrelated to deck @page', () => {
  it('emits @page { margin: 0; size: A4; } and NEVER the deck 13.333in x 7.5in rule', () => {
    const el = document.createElement('div')
    el.innerHTML = '<h1>Doc</h1><p>content</p>'
    const html = getExportHTML(el, defaultExportConfig('Doc'))
    expect(html).toContain('@page { margin: 0; size: A4; }')
    expect(html).not.toContain('13.333in')
    expect(html).not.toContain('7.5in')
  })

  it('continuous export never emits .slide-page / page-break-after: always deck markup', () => {
    const el = document.createElement('div')
    el.innerHTML = '<h1>Doc</h1>'
    const html = getExportHTML(el, defaultExportConfig('Doc'))
    expect(html).not.toContain('.slide-page')
    expect(html).not.toMatch(/page-break-after:\s*always/)
  })

  it('wraps content in .md-content (continuous-mode wrapper), not .slide-page__content', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p>hi</p>'
    const html = getExportHTML(el, defaultExportConfig('Doc'))
    expect(html).toContain('class="md-content"')
    expect(html).not.toContain('slide-page__content')
  })
})

describe('REGRESSION: deck code path (exportDeckToPDF / buildSlidePrintDoc) is never invoked by continuous-mode exportToPDF', () => {
  it('exportToPDF does not call exportDeckToPDF, even with popups blocked (early-return path)', () => {
    const deckSpy = vi.spyOn(slideExportModule, 'exportDeckToPDF')
    const originalOpen = window.open
    const originalAlert = window.alert
    // Simulate blocked popups so exportToPDF short-circuits after the alert — deck code
    // must never be reached from continuous mode regardless of this branch.
    window.open = () => null
    window.alert = () => {}

    const el = document.createElement('div')
    el.innerHTML = '<p>hi</p>'
    exportToPDF(el, defaultExportConfig('Doc'))
    expect(deckSpy).not.toHaveBeenCalled()

    window.open = originalOpen
    window.alert = originalAlert
    deckSpy.mockRestore()
  })

  it('pdfExport.ts source has no import statement pulling in slideExport.ts (static import-graph guard)', async () => {
    // Read the actual source text to assert no cross-import exists — the strongest
    // "never invoked in continuous mode" guarantee available without a full bundler graph.
    // Only look for an actual `import ... from '...slideExport'` statement — a bare
    // substring match would false-positive on code comments that merely mention the
    // filename (as pdfExport.ts's D5 comment does).
    const mod = await import('./pdfExport.ts?raw')
    const src = (mod as { default: string }).default
    expect(src).not.toMatch(/import[^;]*from\s+['"][^'"]*slideExport['"]/)
    // Also verify pdfExport.ts's own exports carry no deck-specific symbols.
    const pdfExportMod = await import('./pdfExport')
    expect((pdfExportMod as Record<string, unknown>).buildSlidePrintDoc).toBeUndefined()
    expect((pdfExportMod as Record<string, unknown>).exportDeckToPDF).toBeUndefined()
  })
})

describe('REGRESSION: additive footerLeft/Center/Right fields on ExportConfig do not change continuous output', () => {
  it('output is byte-identical whether deck-footer fields are present, absent, or populated', () => {
    const el = document.createElement('div')
    el.innerHTML = '<h1>Same</h1><p>Doc</p>'

    const base = defaultExportConfig('Doc')
    const { footerLeft: _fl, footerCenter: _fc, footerRight: _fr, ...withoutDeckFields } = base
    void _fl; void _fc; void _fr

    const htmlNoFields = getExportHTML(el, withoutDeckFields as typeof base)
    const htmlDefaultFields = getExportHTML(el, base)
    const htmlPopulatedFields = getExportHTML(el, { ...base, footerLeft: 'L', footerCenter: 'C', footerRight: 'R' })

    expect(htmlNoFields).toBe(htmlDefaultFields)
    expect(htmlDefaultFields).toBe(htmlPopulatedFields)
  })

  it('defaultExportConfig continues to produce all pre-existing continuous-mode fields unchanged', () => {
    const config = defaultExportConfig('My Doc')
    expect(config.themeId).toBe('classic')
    expect(config.coverPage).toBe(false)
    expect(config.showFooter).toBe(true)
    expect(config.footerPageNumbers).toBe(true)
    expect(config.coverTitle).toBe('My Doc')
  })
})
