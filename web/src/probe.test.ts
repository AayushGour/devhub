import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('probe5', () => {
  it('reads real font names + struct tree from the fixture pdf', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(readFileSync('../test-fixtures/audiobook/salt-history.pdf'))
    const doc = await pdfjs.getDocument({ data, fontExtraProperties: true, useSystemFonts: false }).promise
    console.log('numPages', doc.numPages)
    console.log('markInfo', JSON.stringify(await doc.getMarkInfo()))
    const page = await doc.getPage(1)
    await page.getOperatorList()
    const tc = await page.getTextContent({ includeMarkedContent: true })
    console.log('styles', JSON.stringify(tc.styles))
    const ids = [...new Set(tc.items.filter((i: any) => i.fontName).map((i: any) => i.fontName))]
    const transport = (doc as any).transport ?? (doc as any)._transport
    for (const id of ids) {
      const f: any = await new Promise((res) => transport.commonObjs.get(id, res))
      console.log('FONT', id, '->', f?.name, 'bold=', f?.bold, 'italic=', f?.italic, 'mono=', f?.isMonospace, 'serif=', f?.isSerifFont)
    }
    console.log('marked items sample', JSON.stringify(tc.items.slice(0, 8)))
    console.log('structTree', JSON.stringify(await page.getStructTree()).slice(0, 400))
  }, 60000)
})
