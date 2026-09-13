// The structureless formats: Markdown, plain text and raw bytes.
//
// Every fixture here is a shape a real book arrives in — a chaptered markdown
// export, a table of dates, verse set by indentation, a passage wrapped in a
// `<div>`, an Obsidian export's front matter, a Notepad "Unicode" .txt — and
// each one used to be dropped, narrated as source, or read as one chapter.

import { describe, it, expect } from 'vitest'
import {
  chapterHeadingLevel,
  decodeText,
  detectEncoding,
  readMarkdown,
  readPlainText,
} from './textRead'

const textOf = (blocks: { text: string }[]) => blocks.map((b) => b.text)

/** Every spoken word of a book, for asserting that something is NOT read. */
async function narration(markdown: string): Promise<string> {
  const chapters = await readMarkdown(markdown, 'Fallback')
  return chapters.flatMap((c) => textOf(c.blocks)).join(' | ')
}

describe('chapterHeadingLevel', () => {
  it('splits on h2 when the book has one h1 and many h2s', () => {
    expect(chapterHeadingLevel({ h1: 1, h2: 12, h3: 40 })).toBe('h2')
  })

  it('splits on h1 when the h1s are the chapters', () => {
    expect(chapterHeadingLevel({ h1: 12, h2: 40, h3: 0 })).toBe('h1')
  })

  it('falls back to the shallowest level present, then to h1', () => {
    expect(chapterHeadingLevel({ h1: 0, h2: 1, h3: 0 })).toBe('h2')
    expect(chapterHeadingLevel({ h1: 0, h2: 0, h3: 0 })).toBe('h1')
  })
})

describe('readMarkdown chapters', () => {
  it('makes a chapter of each h2 when the h1 is the book title', async () => {
    const md = '# The Salt Roads\n\n## Chapter One\n\nProse one.\n\n## Chapter Two\n\nProse two.\n'
    const chapters = await readMarkdown(md, 'Fallback')

    expect(chapters.map((c) => c.title)).toEqual([
      'The Salt Roads',
      'Chapter One',
      'Chapter Two',
    ])
  })

  it('keeps splitting on h1 when the h1s are themselves the chapters', async () => {
    const md = '# Chapter One\n\nProse one.\n\n# Chapter Two\n\nProse two.\n'
    const chapters = await readMarkdown(md, 'Fallback')
    expect(chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
  })

  it('leaves headings below the chapter level inside their chapter', async () => {
    const md = '# T\n\n## One\n\n### A scene\n\nx\n\n## Two\n\ny\n'
    const chapters = await readMarkdown(md, 'Fallback')

    expect(chapters.map((c) => c.title)).toEqual(['T', 'One', 'Two'])
    expect(chapters[1].blocks.map((b) => b.type)).toEqual(['h2', 'h3', 'p'])
  })

  it('gives an unstructured document one chapter under the fallback title', async () => {
    const chapters = await readMarkdown('Just prose.\n\nMore of it.\n', 'Fallback')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('Fallback')
  })
})

describe('readMarkdown blocks that used to vanish', () => {
  it('narrates a table, header row included', async () => {
    const md = '| Year | Event |\n| --- | --- |\n| 1791 | The revolt |\n| 1804 | Independence |\n'
    const chapters = await readMarkdown(md, 'Fallback')

    expect(textOf(chapters[0].blocks)).toEqual([
      'Year, Event',
      '1791, The revolt',
      '1804, Independence',
    ])
  })

  it('narrates an indented block — the standard way to set verse', async () => {
    const md = 'Prose.\n\n    Salt on the tongue\n    and salt in the wound\n\nMore prose.\n'
    expect(textOf((await readMarkdown(md, 'Fallback'))[0].blocks)).toEqual([
      'Prose.',
      'Salt on the tongue and salt in the wound',
      'More prose.',
    ])
  })

  it('still says nothing of a fenced code block', async () => {
    const md = 'Prose.\n\n```js\nconst x = 1\n```\n\nMore prose.\n'
    expect(textOf((await readMarkdown(md, 'Fallback'))[0].blocks)).toEqual([
      'Prose.',
      'More prose.',
    ])
  })

  it('narrates prose wrapped in a div with no blank line after the tag', async () => {
    // The whole passage lexes as ONE html token, so skipping html loses it all.
    const md = '<div class="epigraph">\nThe salt roads run east.\nThey always did.\n</div>\n'
    expect(textOf((await readMarkdown(md, 'Fallback'))[0].blocks)).toEqual([
      'The salt roads run east. They always did.',
    ])
  })

  it('says nothing for a bare tag, a comment or an image', async () => {
    const md = '<!-- a note to self -->\n\n<img src="cover.png">\n\nProse.\n'
    expect(textOf((await readMarkdown(md, 'Fallback'))[0].blocks)).toEqual(['Prose.'])
  })
})

describe('readMarkdown inline markup', () => {
  it('speaks a link as its text, not its URL', async () => {
    expect(await narration('See [the docs](https://example.com/a/b?q=1).\n'))
      .toBe('See the docs.')
  })

  it('decodes entities, the way the EPUB path does', async () => {
    expect(await narration('Caf&#233; salt &mdash; pepper &amp; spice.\n'))
      .toBe('Café salt — pepper & spice.')
  })

  it('titles a chapter with the words of its heading, not the source', async () => {
    const chapters = await readMarkdown('# *The* **Salt** Roads\n\nProse.\n', 'Fallback')
    expect(chapters[0].title).toBe('The Salt Roads')
    expect(chapters[0].blocks[0]).toEqual({ type: 'h1', text: 'The Salt Roads' })
  })

  it('strips emphasis from quotes and list items too', async () => {
    const md = '> She said *yes*.\n\n- Read [the docs](https://x.test/y)\n- Salt\n'
    const blocks = (await readMarkdown(md, 'Fallback'))[0].blocks

    expect(blocks).toEqual([
      { type: 'quote', text: 'She said yes.' },
      { type: 'list', text: 'Read the docs' },
      { type: 'list', text: 'Salt' },
    ])
  })

  it('keeps a quote’s paragraphs apart', async () => {
    const blocks = (await readMarkdown('> One.\n>\n> Two.\n', 'Fallback'))[0].blocks
    expect(blocks).toEqual([
      { type: 'quote', text: 'One.' },
      { type: 'quote', text: 'Two.' },
    ])
  })
})

describe('readMarkdown front matter', () => {
  it('does not read the metadata block aloud', async () => {
    const md = '---\ntitle: The Salt Roads\nauthor: Nalo\n---\n\n# The Salt Roads\n\nProse.\n'
    const chapters = await readMarkdown(md, 'Fallback')

    expect(chapters.map((c) => c.title)).toEqual(['The Salt Roads'])
    expect(textOf(chapters[0].blocks)).toEqual(['The Salt Roads', 'Prose.'])
  })

  it('handles CRLF and TOML fences', async () => {
    expect(await narration('---\r\ntitle: X\r\n---\r\n\r\nProse.\r\n')).toBe('Prose.')
    expect(await narration('+++\ntitle = "X"\n+++\n\nProse.\n')).toBe('Prose.')
  })

  it('leaves a document that merely opens with a thematic break alone', async () => {
    const md = '---\n\nProse after a rule.\n\n---\n\nMore prose.\n'
    expect(await narration(md)).toBe('Prose after a rule. | More prose.')
  })
})

describe('readPlainText', () => {
  it('splits a classic-Mac file on its lone carriage returns', () => {
    const chapters = readPlainText(
      'CHAPTER ONE\rThe first line.\rThe second line.',
      'Fallback',
    )

    expect(chapters).toHaveLength(1)
    expect(textOf(chapters[0].blocks)).toEqual([
      'CHAPTER ONE',
      'The first line.',
      'The second line.',
    ])
  })

  it('splits on the heading level that repeats, not on h1 alone', () => {
    const source = '# Book Title\n## Chapter One\nText a.\n## Chapter Two\nText b.\n'
    expect(readPlainText(source, 'Fallback').map((c) => c.title)).toEqual([
      'Book Title',
      'Chapter One',
      'Chapter Two',
    ])
  })

  it('still reads a conventional chapter opening as a chapter', () => {
    const chapters = readPlainText('Chapter I\nA line.\n\nChapter II\nAnother.\n', 'Fallback')
    expect(chapters.map((c) => c.title)).toEqual(['Chapter I', 'Chapter II'])
  })
})

describe('decodeText', () => {
  const utf16le = (text: string, bom = true) => {
    const units = [...text].map((c) => c.charCodeAt(0))
    const bytes = bom ? [0xff, 0xfe] : []
    for (const unit of units) bytes.push(unit & 0xff, unit >> 8)
    return new Uint8Array(bytes)
  }

  it('reads a Windows "Unicode" .txt without leaving NULs in the text', () => {
    const decoded = decodeText(utf16le('Chapter One\nThe salt roads.'))
    expect(decoded).toBe('Chapter One\nThe salt roads.')
    expect(decoded).not.toContain('\0')
  })

  it('detects UTF-16 from the BOM in both byte orders', () => {
    expect(detectEncoding(utf16le('Hi'))).toBe('utf-16le')
    expect(detectEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69])))
      .toBe('utf-16be')
  })

  it('detects BOM-less UTF-16 from the run of NULs', () => {
    expect(detectEncoding(utf16le('Hello there, world', false))).toBe('utf-16le')
    expect(decodeText(utf16le('Hello there, world', false))).toBe('Hello there, world')
  })

  it('reads plain UTF-8, BOM or no BOM', () => {
    const bytes = new TextEncoder().encode('Café — salt.')
    expect(decodeText(bytes)).toBe('Café — salt.')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]))).toBe('Café — salt.')
  })

  it('falls back to windows-1252 rather than a page of replacement characters', () => {
    // 0x92 is a curly apostrophe there and invalid UTF-8 anywhere.
    expect(decodeText(new Uint8Array([0x49, 0x92, 0x6d, 0x20, 0x68, 0x65, 0x72, 0x65])))
      .toBe('I’m here')
  })

  it('drops characters XML cannot carry', () => {
    const bytes = new TextEncoder().encode('Chapter one.\0 And then \x07 the rest.')
    expect(decodeText(bytes)).toBe('Chapter one. And then  the rest.')
  })
})
