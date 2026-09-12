// Plain text, Markdown and Word input.
//
// These formats carry far less structure than an EPUB, so chapter boundaries
// are recovered from headings where they exist and from conventional chapter
// openings where they do not.

import { extractBlocks } from './htmlBlocks'
import type { Block } from './sentences'
import type { ParsedBook, ParsedChapter } from './epubRead'

/** "CHAPTER IV", "Part Two", "Book 3" — the conventional opening of a chapter. */
const CHAPTER_OPENING = /^(chapter|part|book|section)\b[\s.:—-]*([0-9]+|[ivxlcdm]+|[a-z]+)?\s*$/i

/** A short, fully capitalised line reads as a heading in plain text. */
function looksLikeHeading(line: string): boolean {
  if (line.length > 60) return false
  if (CHAPTER_OPENING.test(line)) return true
  const letters = line.replace(/[^a-z]/gi, '')
  return letters.length >= 3 && letters === letters.toUpperCase()
}

function finish(chapters: ParsedChapter[], fallbackTitle: string): ParsedChapter[] {
  const kept = chapters.filter((c) => c.blocks.length > 0)
  if (kept.length > 0) return kept
  return [{ title: fallbackTitle, blocks: [], href: 'text' }]
}

export function readPlainText(source: string, fallbackTitle: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = []
  let current: ParsedChapter | null = null

  // Returns the chapter rather than assigning it, so TypeScript can still
  // narrow `current` at the call sites.
  const start = (title: string, headingBlock?: Block): ParsedChapter => {
    const chapter: ParsedChapter = {
      title,
      blocks: headingBlock ? [headingBlock] : [],
      href: `text-${chapters.length}`,
    }
    chapters.push(chapter)
    return chapter
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const markdownHeading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (markdownHeading) {
      const [, hashes, text] = markdownHeading
      const type = (['h1', 'h2', 'h3'] as const)[hashes.length - 1]
      // Only a top-level heading starts a new chapter; deeper ones are sections.
      if (type === 'h1' || !current) current = start(text, { type, text })
      else current.blocks.push({ type, text })
      continue
    }

    if (looksLikeHeading(line)) {
      current = start(line, { type: 'h1', text: line })
      continue
    }

    if (!current) current = start(fallbackTitle)
    current.blocks.push({ type: 'p', text: line })
  }

  return finish(chapters, fallbackTitle)
}

/**
 * Markdown. `marked` is used only as a lexer — no HTML is produced, so this
 * stays free of any DOM dependency and runs in a worker.
 */
export async function readMarkdown(
  source: string,
  fallbackTitle: string,
): Promise<ParsedChapter[]> {
  const { marked } = await import('marked')
  const tokens = marked.lexer(source)

  const chapters: ParsedChapter[] = []
  let current: ParsedChapter | null = null

  const push = (block: Block) => {
    if (!current) {
      current = { title: fallbackTitle, blocks: [], href: `md-${chapters.length}` }
      chapters.push(current)
    }
    current.blocks.push(block)
  }

  for (const token of tokens) {
    if (token.type === 'heading') {
      const depth = Math.min(3, token.depth) as 1 | 2 | 3
      const type = (['h1', 'h2', 'h3'] as const)[depth - 1]
      if (depth === 1) {
        current = { title: token.text, blocks: [], href: `md-${chapters.length}` }
        chapters.push(current)
      }
      push({ type, text: token.text })
      continue
    }

    if (token.type === 'paragraph' || token.type === 'text') {
      const text = token.text?.trim()
      if (text) push({ type: 'p', text })
      continue
    }

    if (token.type === 'blockquote') {
      const text = token.text?.trim()
      if (text) push({ type: 'quote', text })
      continue
    }

    if (token.type === 'list') {
      for (const item of token.items ?? []) {
        const text = item.text?.trim()
        if (text) push({ type: 'list', text })
      }
    }
    // code, hr, html, space: nothing worth narrating.
  }

  return finish(chapters, fallbackTitle)
}

/**
 * Word documents. mammoth's HTML conversion preserves heading styles, which is
 * what makes chapter detection reliable here; if it cannot run, the raw-text
 * path still produces a readable book with weaker structure.
 */
export async function readDocx(
  bytes: Uint8Array,
  fallbackTitle: string,
): Promise<ParsedChapter[]> {
  const mammoth = await import('mammoth')
  const arrayBuffer = bytes.slice().buffer as ArrayBuffer

  let blocks: Block[]
  try {
    const { value } = await mammoth.convertToHtml({ arrayBuffer })
    blocks = extractBlocks(value)
  } catch {
    const { value } = await mammoth.extractRawText({ arrayBuffer })
    return readPlainText(value, fallbackTitle)
  }

  // Split on top-level headings; everything before the first one is chapter 1.
  const chapters: ParsedChapter[] = []
  let current: ParsedChapter | null = null

  for (const block of blocks) {
    if (block.type === 'h1' || (block.type === 'h2' && !current)) {
      current = { title: block.text, blocks: [block], href: `docx-${chapters.length}` }
      chapters.push(current)
      continue
    }
    if (!current) {
      current = { title: fallbackTitle, blocks: [], href: `docx-${chapters.length}` }
      chapters.push(current)
    }
    current.blocks.push(block)
  }

  return finish(chapters, fallbackTitle)
}

/** Wrap chapters from a structureless source into a book record. */
export function asBook(
  chapters: ParsedChapter[],
  title: string,
  language = 'en',
): ParsedBook {
  return { title, author: 'Unknown', language, chapters, hasMediaOverlays: false }
}
