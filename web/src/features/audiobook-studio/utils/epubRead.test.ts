// Reading a real EPUB container, built in the test so the contract is the
// actual zip rather than a stand-in.

import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readEpub } from './epubRead'
import { allLeaves } from './navTree'

interface Doc { id: string; href: string; xhtml: string; linear?: 'no'; bodyType?: string }

function buildEpub(docs: Doc[], navBody: string): Uint8Array {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    'EPUB/content.opf': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:test</dc:identifier><dc:title>Test Book</dc:title>
    <dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${docs.map((d) => `<item id="${d.id}" href="${d.href}" media-type="application/xhtml+xml"/>`).join('')}
  </manifest>
  <spine>
    ${docs.map((d) => `<itemref idref="${d.id}"${d.linear ? ` linear="${d.linear}"` : ''}/>`).join('')}
  </spine>
</package>`),
    'EPUB/nav.xhtml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>${navBody}</body></html>`,
    ),
  }
  for (const doc of docs) {
    const bodyAttrs = doc.bodyType ? ` epub:type="${doc.bodyType}"` : ''
    files[`EPUB/${doc.href}`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body${bodyAttrs}>${doc.xhtml}</body></html>`,
    )
  }
  return zipSync(files)
}

describe('one document holding several chapters', () => {
  // The commonest real shape, and the one a one-file-per-chapter fixture hides:
  // a single spine document with a contents entry pointing into each part.
  const bytes = buildEpub(
    [
      {
        id: 'all',
        href: 'all.xhtml',
        xhtml: `
          <section id="ch1"><h1>Chapter One</h1><p>The caravans moved at night.</p></section>
          <section id="ch2"><h1>Chapter Two</h1><p>Twenty days without a well.</p></section>
          <section id="ch3"><h1>Chapter Three</h1><p>Salt arrived as slabs.</p></section>`,
      },
    ],
    `<nav epub:type="toc"><ol>
       <li><a href="all.xhtml#ch1">Chapter One</a></li>
       <li><a href="all.xhtml#ch2">Chapter Two</a></li>
       <li><a href="all.xhtml#ch3">Chapter Three</a></li>
     </ol></nav>`,
  )

  it('cuts the document at each contents anchor', async () => {
    const book = await readEpub(bytes, 'fallback')
    expect(book.chapters.map((c) => c.title)).toEqual([
      'Chapter One', 'Chapter Two', 'Chapter Three',
    ])
    // Each piece holds only its own prose.
    expect(book.chapters[1].blocks.map((b) => b.text)).toEqual([
      'Chapter Two', 'Twenty days without a well.',
    ])
  })

  it('gives every piece its own place in the contents tree', async () => {
    const book = await readEpub(bytes, 'fallback')
    expect(allLeaves(book.nav ?? [])).toEqual([0, 1, 2])
  })
})

describe('documents outside the reading order', () => {
  it('skips a spine item marked auxiliary', async () => {
    // "a reading system might... omit [it] from an aural rendering"
    const bytes = buildEpub(
      [
        { id: 'a', href: 'a.xhtml', xhtml: '<h1>Chapter One</h1><p>Real prose here.</p>' },
        { id: 'b', href: 'b.xhtml', xhtml: '<h1>Answer Key</h1><p>Not for reading.</p>', linear: 'no' },
      ],
      '<nav epub:type="toc"><ol><li><a href="a.xhtml">Chapter One</a></li></ol></nav>',
    )
    const book = await readEpub(bytes, 'fallback')
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One'])
  })

  it('skips navigation and apparatus documents by their declared semantics', async () => {
    const bytes = buildEpub(
      [
        { id: 't', href: 'toc.xhtml', bodyType: 'toc', xhtml: '<h1>Contents</h1><p>1. One</p>' },
        { id: 'c', href: 'c.xhtml', xhtml: '<h1>Chapter One</h1><p>Real prose here.</p>' },
      ],
      '<nav epub:type="toc"><ol><li><a href="c.xhtml">Chapter One</a></li></ol></nav>',
    )
    const book = await readEpub(bytes, 'fallback')
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One'])
  })
})

describe('content that is not prose', () => {
  it('leaves out page numbers, note markers, hidden text and ruby glosses', async () => {
    const bytes = buildEpub(
      [
        {
          id: 'a',
          href: 'a.xhtml',
          xhtml: `<h1>Chapter One</h1>
            <p>He crossed the river<span epub:type="pagebreak" id="p42">42</span> at dawn.</p>
            <p>The cat sat<a epub:type="noteref" href="#n1">1</a> on the mat.</p>
            <p hidden="hidden">Not shown to anyone.</p>
            <p aria-hidden="true">Also not shown.</p>
            <p><ruby>漢<rt>kan</rt></ruby>字</p>`,
        },
      ],
      '<nav epub:type="toc"><ol><li><a href="a.xhtml">Chapter One</a></li></ol></nav>',
    )
    const book = await readEpub(bytes, 'fallback')
    const text = book.chapters[0].blocks.map((b) => b.text)

    expect(text).toContain('He crossed the river at dawn.')
    expect(text).toContain('The cat sat on the mat.')
    expect(text.join(' ')).not.toContain('Not shown')
    expect(text.join(' ')).not.toContain('Also not shown')
    // The ruby gloss would otherwise be spoken alongside the character it glosses.
    expect(text.join(' ')).not.toContain('kan')
  })
})
