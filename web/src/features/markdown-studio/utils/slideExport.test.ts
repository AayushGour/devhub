import { describe, it, expect } from 'vitest'
import { buildSlidePrintDoc } from './slideExport'
import { defaultExportConfig } from './pdfExport'

describe('buildSlidePrintDoc', () => {
  it('emits @page { size: 13.333in 7.5in; margin: 0 }', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toContain('@page { size: 13.333in 7.5in; margin: 0; }')
  })

  it('gives every .slide-page page-break-after: always', () => {
    const html = buildSlidePrintDoc('<div class="slide-page"></div>', defaultExportConfig('Deck'))
    expect(html).toMatch(/\.slide-page\s*\{[^}]*page-break-after:\s*always/)
  })

  it('never emits notes text — deck html passed in must already exclude notes, and the doc wrapper adds none', () => {
    const deckHtmlWithoutNotes = '<div class="slide-page"><div class="slide-page__content"><h1>Title</h1><p>Body text</p></div></div>'
    const html = buildSlidePrintDoc(deckHtmlWithoutNotes, defaultExportConfig('Deck'))
    expect(html).not.toContain('speaker notes')
    expect(html).not.toContain('Mention this reuses')
  })

  it('includes the provided deck markup verbatim in the body', () => {
    const deckHtml = '<div class="slide-page" data-testid="page-1">Slide one content</div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).toContain('Slide one content')
    expect(html).toContain('data-testid="page-1"')
  })

  it('uses the config coverTitle as the document title', () => {
    const html = buildSlidePrintDoc('<div></div>', { ...defaultExportConfig('My Deck'), coverTitle: 'My Deck' })
    expect(html).toContain('<title>My Deck</title>')
  })
})

describe('buildSlidePrintDoc strips preview-only chrome (overflow badge) before serializing', () => {
  it('removes a .slide-overflow-badge element entirely, including its text content', () => {
    const deckHtml = '<div class="slide-page"><span class="slide-overflow-badge">content overflows</span><h1>Title</h1></div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).not.toContain('content overflows')
    expect(html).not.toContain('slide-overflow-badge')
    expect(html).toContain('<h1>Title</h1>')
  })

  it('strips multiple badge elements across multiple slides', () => {
    const deckHtml = [
      '<div class="slide-page"><span class="slide-overflow-badge">content overflows</span></div>',
      '<div class="slide-page"><span class="slide-overflow-badge">content overflows</span></div>',
    ].join('')
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).not.toContain('slide-overflow-badge')
  })

  it('leaves the rest of the slide markup (including the page-number badge and footer) untouched', () => {
    const deckHtml = '<div class="slide-page"><span class="slide-overflow-badge">content overflows</span><div class="slide-page__footer">Left · 1</div></div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).not.toContain('content overflows')
    expect(html).toContain('slide-page__footer')
    expect(html).toContain('Left · 1')
  })

  it('is a no-op when no badge element is present', () => {
    const deckHtml = '<div class="slide-page"><h1>Title</h1></div>'
    const html = buildSlidePrintDoc(deckHtml, defaultExportConfig('Deck'))
    expect(html).toContain('<h1>Title</h1>')
  })
})
