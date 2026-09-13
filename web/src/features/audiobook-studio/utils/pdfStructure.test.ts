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

  it('always separates recognised words, whose boxes sit tight together', () => {
    // OCR boxes hug the glyphs, so the gap between two words can be narrower
    // than the run-splitting threshold. Without the flag this reads
    // "DevHubArchitecture".
    const items = [
      { str: 'DevHub', x: 72, y: 700, width: 40, height: 10, isWord: true },
      { str: 'Architecture', x: 113, y: 700, width: 70, height: 10, isWord: true },
    ]
    expect(assembleLines(items)[0].text).toBe('DevHub Architecture')
  })

  it('recovers a space that was rendered as positioning rather than a character', () => {
    // A heading set as several runs, the space between words being a gap of
    // about a quarter em. Nothing in the text says "space".
    const items = [
      { str: 'DevHub', x: 326, y: 297, width: 108, height: 33 },
      { str: 'Architecture', x: 442, y: 297, width: 190, height: 33 },
    ]
    expect(assembleLines(items)[0].text).toBe('DevHub Architecture')
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
      { text: 'Chapter One', height: 24, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
      { text: 'A Section', height: 16, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
      { text: 'Ordinary body prose that runs on for a while.', height: 10, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
      { text: 'More ordinary body prose.', height: 10, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
    ])
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'h2', 'p', 'p'])
  })

  it('does not promote a long line just because it is set larger', () => {
    const long = 'x'.repeat(200)
    const blocks = classifyParagraphs([
      { text: long, height: 24, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
      { text: 'body', height: 10, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
      { text: 'body two', height: 10, x0: 72, y: 700, bold: false, pageIndex: 0, continues: false },
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

describe('sections finer than pages', () => {
  /** A page holding two sections, each a heading over a body line. */
  const twoSectionPage = (index: number, a: string, b: string) =>
    page(index, [
      { str: a, x: 72, y: 700, width: 200, height: 17 },
      bodyLine('Body under the first heading.', 660),
      { str: b, x: 72, y: 560, width: 200, height: 17 },
      bodyLine('Body under the second heading.', 520),
    ])

  it('splits two sections that share a page, using the outline position', () => {
    const pages = [twoSectionPage(0, '1. First Section', '2. Second Section')]
    const chapters = buildChapters(pages, [
      { title: '1. First Section', pageIndex: 0, y: 700 },
      { title: '2. Second Section', pageIndex: 0, y: 560 },
    ])

    expect(chapters.map((c) => c.title)).toEqual(['1. First Section', '2. Second Section'])
    // Each section keeps only its own prose — a page-granular split would put
    // everything in one chapter and label it with the last entry on the page.
    expect(chapters[0].blocks.some((b) => b.text.includes('second'))).toBe(false)
    expect(chapters[1].blocks.some((b) => b.text.includes('first'))).toBe(false)
  })

  it('still works when the outline gives no coordinate', () => {
    const pages = [twoSectionPage(0, 'Only Section', 'Still The Same Section')]
    const chapters = buildChapters(pages, [{ title: 'Only Section', pageIndex: 0 }])
    expect(chapters).toHaveLength(1)
    expect(chapters[0].blocks.length).toBeGreaterThan(1)
  })

  it('splits on the heading level that recurs, not the one-off title', () => {
    // A title set larger than the section headings, used once.
    const pages = [
      page(0, [
        { str: 'Document Title', x: 72, y: 740, width: 200, height: 23 },
        { str: 'Section One', x: 72, y: 690, width: 150, height: 17 },
        bodyLine('The caravans moved at night, when the sand was cold and the', 650),
        bodyLine('stars were a map, and the guides counted forty camels.', 636),
        { str: 'Section Two', x: 72, y: 560, width: 150, height: 17 },
        bodyLine('Salt arrived as slabs and left again as coins, recorded by', 520),
        bodyLine('the scribes of Sankore in a ledger that outlived them.', 506),
      ]),
    ]
    const chapters = buildChapters(pages, [])
    // The title block before the first section keeps its own name rather than
    // a generic one, and the recurring level does the splitting.
    expect(chapters.map((c) => c.title)).toEqual([
      'Document Title',
      'Section One',
      'Section Two',
    ])
  })
})

describe('multi-line headings', () => {
  it('keeps a heading that wraps onto a second line as one block', () => {
    // Larger type is set on looser leading, so the gap inside the heading
    // exceeds the page's median line gap.
    const pages = [
      page(0, [
        { str: '2. Current state (what already exists', x: 72, y: 700, width: 300, height: 17 },
        { str: 'do not rebuild these)', x: 72, y: 678, width: 200, height: 17 },
        bodyLine('The attached repo already implements this.', 640),
        bodyLine('A second line of ordinary prose.', 626),
      ]),
    ]
    const blocks = buildChapters(pages, [])[0].blocks
    const heading = blocks.find((b) => b.type.startsWith('h'))
    expect(heading?.text).toBe('2. Current state (what already exists do not rebuild these)')
  })
})

describe('defects found against real documents', () => {
  it('finds the gutter on a two-column page carrying a full-width heading', () => {
    // The heading crosses the gutter, closing the only gap on the page. Counted
    // as body text it hides the columns entirely and the two interleave.
    const items: PdfTextItem[] = [
      { str: 'A Heading Across The Whole Page', x: 40, y: 760, width: 520, height: 18 },
    ]
    for (let i = 0; i < 15; i++) {
      items.push({ str: 'left column text', x: 40, y: 700 - i * 14, width: 220, height: 10 })
      items.push({ str: 'right column text', x: 330, y: 700 - i * 14, width: 220, height: 10 })
    }
    const gutter = findColumnGutter(page(0, items))
    expect(gutter).not.toBeNull()
    expect(gutter!).toBeGreaterThan(260)
    expect(gutter!).toBeLessThan(330)
  })

  it('strips a running head set further in than a tenth of the page', () => {
    // 11.7% down — outside the old band, still plainly furniture.
    const y = Math.round(PAGE_H * (1 - 0.117))
    const pages = [1, 2, 3, 4, 5].map((n) =>
      page(n - 1, [
        item('A History of Salt', 200, y),
        bodyLine(`Body text of page ${n}.`, 400),
      ]),
    )
    for (const p of stripRunningHeads(pages)) {
      expect(p.items.map((i) => i.str)).toEqual([expect.stringContaining('Body text')])
    }
  })

  it('does not let an unfinished page absorb the next page heading', () => {
    // A printed contents page ends without a full stop, so it looks like it
    // continues — and would swallow the chapter title that follows it.
    const pages = [
      page(0, [bodyLine('Contents', 700), bodyLine('1. The Salt Roads', 680)]),
      page(1, [
        { str: 'Chapter One', x: 72, y: 700, width: 120, height: 20 },
        bodyLine('The caravans moved at night.', 660),
      ]),
    ]
    const blocks = buildChapters(pages, []).flatMap((c) => c.blocks)
    const heading = blocks.find((b) => b.type.startsWith('h'))
    expect(heading?.text).toBe('Chapter One')
    expect(blocks.some((b) => b.text.includes('Salt Roads') && b.text.includes('Chapter One')))
      .toBe(false)
  })

  it('treats a bold line at body size as a heading', () => {
    // Size alone cannot see this: the heading is set at the body's own size and
    // marked only by weight.
    const paragraphs = [
      { text: 'Why Reparenting Works', height: 11, x0: 72, y: 700, bold: true, pageIndex: 0, continues: false },
      { text: 'We have spent the last six chapters learning the truth about what wounds us.', height: 11, x0: 72, y: 680, bold: false, pageIndex: 0, continues: false },
      { text: 'Just like in any relationship, you would not offer advice without knowing the person.', height: 11, x0: 72, y: 660, bold: false, pageIndex: 0, continues: false },
    ]
    expect(classifyParagraphs(paragraphs).map((b) => b.type)).toEqual(['h1', 'p', 'p'])
  })

  it('ignores weight in a document that is mostly bold', () => {
    // Where bold is the norm it distinguishes nothing.
    const paragraphs = Array.from({ length: 4 }, (_, i) => ({
      text: `A bold paragraph of ordinary prose number ${i}.`,
      height: 11, x0: 72, y: 700 - i * 20, bold: true, pageIndex: 0, continues: false,
    }))
    expect(classifyParagraphs(paragraphs).every((b) => b.type === 'p')).toBe(true)
  })
})
