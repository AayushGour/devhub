import { describe, it, expect } from 'vitest'
import { getExportHTML, defaultExportConfig } from './pdfExport'

// Regression guard (D5 / coding-standards.md "Regression"): the deck-footer fields
// added to ExportConfig are additive only — continuous-mode buildPrintDoc must still
// emit the A4 @page rule and must never reference deck-only concepts.
describe('pdfExport continuous-mode regression', () => {
  it('emits @page { margin: 0; size: A4; } unchanged', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p>hello</p>'
    const html = getExportHTML(el, defaultExportConfig('Doc'))
    expect(html).toContain('@page { margin: 0; size: A4; }')
  })

  it('defaultExportConfig includes the new optional deck-footer fields, defaulted empty', () => {
    const config = defaultExportConfig('Doc')
    expect(config.footerLeft).toBe('')
    expect(config.footerCenter).toBe('')
    expect(config.footerRight).toBe('')
  })

  it('continuous export output is unaffected by the new fields being present', () => {
    const el = document.createElement('div')
    el.innerHTML = '<p>hello</p>'
    const withoutDeckFields = getExportHTML(el, { ...defaultExportConfig('Doc'), footerLeft: undefined, footerCenter: undefined, footerRight: undefined })
    const withDeckFields = getExportHTML(el, { ...defaultExportConfig('Doc'), footerLeft: 'L', footerCenter: 'C', footerRight: 'R' })
    expect(withoutDeckFields).toBe(withDeckFields)
  })
})
