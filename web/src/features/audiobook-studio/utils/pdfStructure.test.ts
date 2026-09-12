import { describe, it, expect } from 'vitest'
import {
  assembleLines,
  buildChapters,
  classifyParagraphs,
  dehyphenate,
  findColumnGutter,
  groupParagraphs,
  stripRunningHeads,
  type PdfPage,
  type PdfTextItem,
} from './pdfStructure'

const PAGE_W = 600
const PAGE_H = 800

function item(str: string, x: number, y: number, height = 10): PdfTextItem {
  return { str, x, y, width: str.length * height * 0.5, height }
}

function page(index: number, items: PdfTextItem[]): PdfPage {
  return { index, width: PAGE_W, height: PAGE_H, items }
}

/** A body line at the given y, filling the text column. */
function bodyLine(text: string, y: number, x = 72, height = 10): PdfTextItem {
  return { str: text, x, y, width: 450, height }
}

describe('stripRunningHeads', () => {
  it('drops a repeating header and a changing page number', () => {
    const pages = [1, 2, 3, 4, 5].map((n) =>
      page(n - 1, [
        item('THE SALT ROADS', 200, 760),
        bodyLine(`Body text of page ${n}.`, 400),
        item(String(n * 10), 300, 40),
      ]),
    )

    const stripped = stripRunningHeads(pages)
    for (const p of stripped) {
      expect(p.items.map((i) => i.str)).toEqual([expect.stringContaining('Body text')])
    }
  })

  it('keeps body text that happens to repeat mid-page', () => {
    const pages = [1, 2, 3, 4].map((n) =>
      page(n - 1, [item('Recurring refrain.', 72, 400), bodyLine(`Unique ${n}.`, 300)]),
    )
    const stripped = stripRunningHeads(pages)
    expect(stripped[0].items).toHaveLength(2)
  })

  it('leaves short documents alone — too few pages to tell furniture from prose', () => {
    const pages = [page(0, [item('Title', 200, 760)])]
    expect(stripRunningHeads(pages)).toEqual(pages)
  })
})

describe('findColumnGutter', () => {
  it('finds the gutter on a two-column page', () => {
    const items: PdfTextItem[] = []
    for (let i = 0; i < 15; i++) {
      items.push({ str: 'left column text', x: 40, y: 700 - i * 14, width: 220, height: 10 })
      items.push({ str: 'right column text', x: 330, y: 700 - i * 14, width: 220, height: 10 })
    }
    const gutter = findColumnGutter(page(0, items))
    expect(gutter).not.toBeNull()
    expect(gutter!).toBeGreaterThan(260)
    expect(gutter!).toBeLessThan(330)
  })

  it('returns null for a single-column page', () => {
    const items = Array.from({ length: 30 }, (_, i) => bodyLine('full width line', 700 - i * 14))
    expect(findColumnGutter(page(0, items))).toBeNull()
  })
})

describe('assembleLines', () => {
  it('groups items on a shared baseline and orders top to bottom', () => {
    const items = [
      { str: 'world', x: 130, y: 700, width: 40, height: 10 },
      { str: 'Hello', x: 72, y: 701, width: 40, height: 10 },
      { str: 'Second line', x: 72, y: 680, width: 80, height: 10 },
    ]
    expect(assembleLines(items).map((l) => l.text)).toEqual(['Hello world', 'Second line'])
  })

  it('does not insert a space inside a word split across runs', () => {
    const items = [
      { str: 'philo', x: 72, y: 700, width: 25, height: 10 },
      { str: 'sophy', x: 97, y: 700, width: 25, height: 10 },
    ]
    expect(assembleLines(items)[0].text).toBe('philosophy')
  })
})

describe('groupParagraphs', () => {
  it('breaks on a wide vertical gap', () => {
    const lines = assembleLines([
      bodyLine('First paragraph line one.', 700),
      bodyLine('First paragraph line two.', 686),
      bodyLine('Second paragraph after a gap.', 640),
    ])
    const paragraphs = groupParagraphs(lines, 0)
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe('First paragraph line one. First paragraph line two.')
  })

  it('breaks on a first-line indent', () => {
    const lines = assembleLines([
      bodyLine('Flush left line.', 700, 72),
      bodyLine('Indented new paragraph.', 686, 100),
    ])
    expect(groupParagraphs(lines, 0)).toHaveLength(2)
  })
})

describe('classifyParagraphs', () => {
  it('ranks distinct large sizes into heading levels', () => {
    const blocks = classifyParagraphs([
      { text: 'Chapter One', height: 24, x0: 72, pageIndex: 0, continues: false },
      { text: 'A Section', height: 16, x0: 72, pageIndex: 0, continues: false },
      { text: 'Ordinary body prose that runs on for a while.', height: 10, x0: 72, pageIndex: 0, continues: false },
      { text: 'More ordinary body prose.', height: 10, x0: 72, pageIndex: 0, continues: false },
    ])
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'p', 'p'])
  })

  it('does not promote a long line just because it is set larger', () => {
    const long = 'x'.repeat(200)
    const blocks = classifyParagraphs([
      { text: long, height: 24, x0: 72, pageIndex: 0, continues: false },
      { text: 'body', height: 10, x0: 72, pageIndex: 0, continues: false },
      { text: 'body two', height: 10, x0: 72, pageIndex: 0, continues: false },
    ])
    expect(blocks[0].type).toBe('p')
  })
})

describe('dehyphenate', () => {
  it('rejoins a word broken across lines', () => {
    expect(dehyphenate('philo- sophy')).toBe('philosophy')
  })

  it('leaves real compounds intact', () => {
    expect(dehyphenate('Anglo- Saxon')).toBe('Anglo- Saxon')
    expect(dehyphenate('well-known')).toBe('well-known')
  })
})

describe('buildChapters', () => {
  const pages = [0, 1, 2, 3].map((index) =>
    page(index, [
      { str: `Chapter ${index + 1}`, x: 72, y: 740, width: 100, height: 20 },
      bodyLine(`Body of page ${index + 1} runs here.`, 700),
    ]),
  )

  it('uses the PDF outline when there is one', () => {
    const chapters = buildChapters(pages, [
      { title: 'Beginnings', pageIndex: 0 },
      { title: 'Endings', pageIndex: 2 },
    ])
    expect(chapters.map((c) => c.title)).toEqual(['Beginnings', 'Endings'])
    expect(chapters[0].blocks.length).toBeGreaterThan(0)
  })

  it('falls back to headings when there is no outline', () => {
    const chapters = buildChapters(pages, [])
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4',
    ])
  })

  it('falls back to fixed page runs when there are no headings either', () => {
    const flat = [0, 1, 2].map((index) =>
      page(index, [bodyLine(`Page ${index + 1} prose.`, 700)]),
    )
    const chapters = buildChapters(flat, [], 2)
    expect(chapters.map((c) => c.title)).toEqual(['Part 1', 'Part 2'])
  })
})
