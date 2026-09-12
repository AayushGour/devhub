// Recovering document structure from a PDF.
//
// A PDF has no paragraphs, no chapters and no reading order — only positioned
// runs of glyphs. Everything below reconstructs that structure from geometry,
// and every function here is pure so it can be tested without pdf.js.
//
// The pipeline, in order:
//   strip running heads -> split columns -> assemble lines -> group paragraphs
//   -> classify headings -> join hyphens -> cut into chapters

import type { Block } from './sentences'

export interface PdfTextItem {
  str: string
  /** Left edge, in PDF user space (origin bottom-left). */
  x: number
  /** Baseline. Larger values are HIGHER on the page. */
  y: number
  width: number
  height: number
  fontName?: string
}

export interface PdfPage {
  index: number
  width: number
  height: number
  items: PdfTextItem[]
}

export interface Line {
  y: number
  x0: number
  x1: number
  height: number
  text: string
}

export interface Paragraph {
  text: string
  /** Largest glyph height in the paragraph — the heading signal. */
  height: number
  x0: number
  pageIndex: number
  /** True when the paragraph ran to the bottom of its column. */
  continues: boolean
}

/** True when the text ends on a sentence terminator, allowing for quotes. */
function endsSentence(text: string): boolean {
  return /[.!?:;\u2026]["'\u201d\u2019)\]]?\s*$/.test(text)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ── running heads ─────────────────────────────────────────────────

/** Digits vary page to page; the rest of a running head does not. */
function headKey(item: PdfTextItem, page: PdfPage): string {
  const band = Math.round((item.y / Math.max(1, page.height)) * 50)
  return `${band}|${item.str.replace(/\d+/g, '#').trim().toLowerCase()}`
}

/**
 * Drop headers, footers and page numbers.
 *
 * Anything in the top or bottom tenth of the page whose text — with digits
 * normalised — recurs at the same height on most pages is furniture, not prose.
 * Narrating it means hearing the book's title once per page.
 */
export function stripRunningHeads(pages: PdfPage[], threshold = 0.6): PdfPage[] {
  if (pages.length < 3) return pages

  // Digit normalisation makes "Chapter 1" and "Chapter 2" look like the same
  // recurring string, so size has to break the tie: a running head is set in
  // body type, while a chapter opening is set larger. Without this, every
  // chapter title that sits near the top of its page is deleted as furniture.
  const bodyHeight = median(pages.flatMap((page) => page.items.map((item) => item.height)))
  const isBodySized = (item: PdfTextItem) =>
    bodyHeight === 0 || item.height <= bodyHeight * 1.2

  const counts = new Map<string, number>()
  for (const page of pages) {
    const seen = new Set<string>()
    for (const item of page.items) {
      if (!inMargin(item, page) || !isBodySized(item)) continue
      const key = headKey(item, page)
      if (seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const limit = pages.length * threshold
  const furniture = new Set(
    [...counts.entries()].filter(([, count]) => count >= limit).map(([key]) => key),
  )

  return pages.map((page) => ({
    ...page,
    items: page.items.filter(
      (item) =>
        !(inMargin(item, page) && isBodySized(item) && furniture.has(headKey(item, page))),
    ),
  }))
}

function inMargin(item: PdfTextItem, page: PdfPage): boolean {
  const top = page.height * 0.9
  const bottom = page.height * 0.1
  return item.y >= top || item.y <= bottom
}

// ── columns ───────────────────────────────────────────────────────

/**
 * Find the x of a vertical gutter splitting the page into two columns.
 *
 * Looks for a band of x values that almost no text crosses while text exists on
 * both sides of it. Returns null for single-column pages, which is the common
 * case; getting this wrong scrambles reading order, so the bar is deliberately
 * high.
 */
export function findColumnGutter(page: PdfPage, minGapRatio = 0.06): number | null {
  if (page.items.length < 20) return null

  const BINS = 60
  const covered = new Array<number>(BINS).fill(0)

  for (const item of page.items) {
    const from = Math.max(0, Math.floor((item.x / page.width) * BINS))
    const to = Math.min(BINS - 1, Math.floor(((item.x + item.width) / page.width) * BINS))
    for (let i = from; i <= to; i++) covered[i] += 1
  }

  // Only consider gutters near the middle — a wide outer margin is not a column.
  const from = Math.floor(BINS * 0.3)
  const to = Math.ceil(BINS * 0.7)

  let bestStart = -1
  let bestLength = 0
  let runStart = -1

  for (let i = from; i <= to; i++) {
    if (covered[i] === 0) {
      if (runStart === -1) runStart = i
      const length = i - runStart + 1
      if (length > bestLength) {
        bestLength = length
        bestStart = runStart
      }
    } else {
      runStart = -1
    }
  }

  if (bestLength < BINS * minGapRatio) return null

  const gutterX = ((bestStart + bestLength / 2) / BINS) * page.width
  const left = page.items.filter((item) => item.x + item.width <= gutterX).length
  const right = page.items.filter((item) => item.x >= gutterX).length

  // Both sides must carry real text, or this is just a wide indent.
  const minimum = page.items.length * 0.2
  return left >= minimum && right >= minimum ? gutterX : null
}

// ── lines ─────────────────────────────────────────────────────────

/** Group items sharing a baseline into lines, ordered top to bottom. */
export function assembleLines(items: PdfTextItem[]): Line[] {
  if (items.length === 0) return []

  const tolerance = Math.max(1, median(items.map((i) => i.height)) * 0.5)
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

  const lines: Line[] = []
  let bucket: PdfTextItem[] = []

  const flush = () => {
    if (bucket.length === 0) return
    const ordered = [...bucket].sort((a, b) => a.x - b.x)

    // Join runs with a space only where the gap is wider than a thin space —
    // PDFs often split a single word across several items.
    let text = ''
    let previousEnd: number | null = null
    for (const item of ordered) {
      const gap = previousEnd === null ? 0 : item.x - previousEnd
      if (previousEnd !== null && gap > item.height * 0.25) text += ' '
      text += item.str
      previousEnd = item.x + item.width
    }

    lines.push({
      y: ordered[0].y,
      x0: ordered[0].x,
      x1: previousEnd ?? ordered[0].x,
      height: Math.max(...ordered.map((i) => i.height)),
      text: text.replace(/\s+/g, ' ').trim(),
    })
    bucket = []
  }

  for (const item of sorted) {
    if (bucket.length > 0 && Math.abs(bucket[0].y - item.y) > tolerance) flush()
    bucket.push(item)
  }
  flush()

  return lines.filter((line) => line.text.length > 0)
}

// ── paragraphs ────────────────────────────────────────────────────

/** Break lines into paragraphs on vertical gaps and first-line indents. */
export function groupParagraphs(lines: Line[], pageIndex: number): Paragraph[] {
  if (lines.length === 0) return []

  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y)

  const typicalGap = median(gaps.filter((g) => g > 0))
  const typicalX = median(lines.map((line) => line.x0))
  const typicalWidth = median(lines.map((line) => line.x1 - line.x0))

  const paragraphs: Paragraph[] = []
  let current: Line[] = []

  const flush = (continues: boolean) => {
    if (current.length === 0) return
    paragraphs.push({
      text: current.map((line) => line.text).join(' '),
      height: Math.max(...current.map((line) => line.height)),
      x0: current[0].x0,
      pageIndex,
      continues,
    })
    current = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const gap = i === 0 ? 0 : lines[i - 1].y - line.y

    const wideGap = typicalGap > 0 && gap > typicalGap * 1.5
    const indented = line.x0 > typicalX + Math.max(4, typicalWidth * 0.02)

    // A change of type size ends a block regardless of spacing. Headings are
    // often set only a line apart from the prose beneath them, and without this
    // they are absorbed into the following paragraph and stop being headings.
    const previous = lines[i - 1]
    const resized =
      i > 0 && Math.abs(line.height - previous.height) > Math.max(0.5, previous.height * 0.15)

    if (i > 0 && (wideGap || indented || resized)) flush(false)
    current.push(line)
  }

  // The last paragraph on a page may run onto the next one. Width alone cannot
  // tell — a single full-width line is both the widest and the median, so every
  // page would claim to continue and the whole book would merge into one
  // paragraph. Punctuation is the reliable signal: prose that stops without a
  // terminator is mid-sentence.
  const last = lines[lines.length - 1]
  const reachesMargin = last.x1 - last.x0 >= typicalWidth * 0.85
  flush(reachesMargin && !endsSentence(last.text))

  return paragraphs
}

// ── classification ────────────────────────────────────────────────

const SHORT_ENOUGH_FOR_A_HEADING = 80

/**
 * Assign block types. Headings are set in larger type than the body, short, and
 * standalone; the size clusters found on the page decide h1 vs h2 vs h3.
 */
export function classifyParagraphs(paragraphs: Paragraph[]): Block[] {
  if (paragraphs.length === 0) return []

  const bodyHeight = median(paragraphs.map((p) => p.height))

  // Distinct heading sizes, largest first — rank becomes heading level.
  const headingSizes = [
    ...new Set(
      paragraphs
        .filter((p) => p.height > bodyHeight * 1.2 && p.text.length <= SHORT_ENOUGH_FOR_A_HEADING)
        .map((p) => Math.round(p.height * 2) / 2),
    ),
  ].sort((a, b) => b - a)

  return paragraphs.map((paragraph) => {
    const size = Math.round(paragraph.height * 2) / 2
    const rank = headingSizes.indexOf(size)

    if (rank !== -1 && paragraph.text.length <= SHORT_ENOUGH_FOR_A_HEADING) {
      return { type: (['h1', 'h2', 'h3'] as const)[Math.min(rank, 2)], text: paragraph.text }
    }
    return { type: 'p' as const, text: paragraph.text }
  })
}

// ── hyphenation ───────────────────────────────────────────────────

/**
 * Rejoin words split across a line break.
 *
 * Only a hyphen followed by a lowercase letter is treated as a break; joining
 * on an uppercase letter would corrupt real compounds like "Anglo-Saxon".
 */
export function dehyphenate(text: string): string {
  return text.replace(/(\p{Ll})[-­]\s+(\p{Ll})/gu, '$1$2')
}

// ── assembly ──────────────────────────────────────────────────────

export interface PdfOutlineEntry {
  title: string
  pageIndex: number
}

export interface PdfChapter {
  title: string
  blocks: Block[]
}

/** Ordered blocks for one page, honouring any two-column layout. */
export function pageToParagraphs(page: PdfPage): Paragraph[] {
  const gutter = findColumnGutter(page)
  if (gutter === null) return groupParagraphs(assembleLines(page.items), page.index)

  const left = page.items.filter((item) => item.x < gutter)
  const right = page.items.filter((item) => item.x >= gutter)

  return [
    ...groupParagraphs(assembleLines(left), page.index),
    ...groupParagraphs(assembleLines(right), page.index),
  ]
}

/**
 * Cut a document into chapters.
 *
 * The PDF's own outline is used when it has one — real ebooks do, and it beats
 * any heuristic. Otherwise top-level headings become the breaks, and failing
 * that the book is split into fixed runs of pages so it is still navigable.
 */
export function buildChapters(
  pages: PdfPage[],
  outline: PdfOutlineEntry[],
  pagesPerFallbackChapter = 20,
): PdfChapter[] {
  const stripped = stripRunningHeads(pages)
  const paragraphs = stripped.flatMap(pageToParagraphs)

  // Join paragraphs split across a page break before anything is classified.
  const bodyHeight = paragraphs.length
    ? [...paragraphs.map((p) => p.height)].sort((a, b) => a - b)[paragraphs.length >> 1]
    : 0

  const merged: Paragraph[] = []
  for (const paragraph of paragraphs) {
    const previous = merged[merged.length - 1]
    // A heading never runs onto the next page, whatever its punctuation.
    const previousIsHeading = previous && previous.height > bodyHeight * 1.2
    if (previous?.continues && !previousIsHeading && previous.pageIndex !== paragraph.pageIndex) {
      previous.text = dehyphenate(`${previous.text} ${paragraph.text}`)
      previous.continues = paragraph.continues
      continue
    }
    merged.push({ ...paragraph, text: dehyphenate(paragraph.text) })
  }

  const blocks = classifyParagraphs(merged)

  if (outline.length > 0) {
    return splitByOutline(merged, blocks, outline)
  }

  const byHeading = splitByHeadings(blocks)
  if (byHeading.length > 1) return byHeading

  return splitByPageRuns(merged, blocks, pagesPerFallbackChapter)
}

function splitByOutline(
  paragraphs: Paragraph[],
  blocks: Block[],
  outline: PdfOutlineEntry[],
): PdfChapter[] {
  const sorted = [...outline].sort((a, b) => a.pageIndex - b.pageIndex)
  const chapters: PdfChapter[] = sorted.map((entry) => ({ title: entry.title, blocks: [] }))

  let cursor = 0
  for (let i = 0; i < blocks.length; i++) {
    const page = paragraphs[i].pageIndex
    while (cursor + 1 < sorted.length && page >= sorted[cursor + 1].pageIndex) cursor++
    chapters[cursor].blocks.push(blocks[i])
  }

  return chapters.filter((chapter) => chapter.blocks.length > 0)
}

function splitByHeadings(blocks: Block[]): PdfChapter[] {
  const chapters: PdfChapter[] = []
  let current: PdfChapter | null = null

  for (const block of blocks) {
    if (block.type === 'h1') {
      current = { title: block.text, blocks: [block] }
      chapters.push(current)
      continue
    }
    if (!current) {
      current = { title: 'Opening', blocks: [] }
      chapters.push(current)
    }
    current.blocks.push(block)
  }

  return chapters.filter((chapter) => chapter.blocks.length > 0)
}

function splitByPageRuns(
  paragraphs: Paragraph[],
  blocks: Block[],
  pagesPerChapter: number,
): PdfChapter[] {
  const chapters: PdfChapter[] = []

  for (let i = 0; i < blocks.length; i++) {
    const part = Math.floor(paragraphs[i].pageIndex / pagesPerChapter)
    if (!chapters[part]) chapters[part] = { title: `Part ${part + 1}`, blocks: [] }
    chapters[part].blocks.push(blocks[i])
  }

  return chapters.filter(Boolean).filter((chapter) => chapter.blocks.length > 0)
}
