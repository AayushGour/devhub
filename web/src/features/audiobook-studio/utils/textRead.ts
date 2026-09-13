// Plain text, Markdown and Word input.
//
// These formats carry far less structure than an EPUB, so chapter boundaries
// are recovered from headings where they exist and from conventional chapter
// openings where they do not.

import { extractBlocks } from './htmlBlocks'
import { normalizeText } from './markup'
import type { Block } from './sentences'
import type { ParsedBook, ParsedChapter } from './epubRead'

/** "CHAPTER IV", "Part Two", "Book 3" — the conventional opening of a chapter. */
const CHAPTER_OPENING = /^(chapter|part|book|section)\b[\s.:—-]*([0-9]+|[ivxlcdm]+|[a-z]+)?\s*$/i

type HeadingType = 'h1' | 'h2' | 'h3'

const HEADING_TYPES = ['h1', 'h2', 'h3'] as const

/** How many headings the source has at each level. */
type HeadingCounts = Record<HeadingType, number>

/** Levels below h3 are still headings — they just share h3's voice. */
function headingTypeFor(depth: number): HeadingType {
  return HEADING_TYPES[Math.min(3, Math.max(1, depth)) - 1]
}

function headingLevelOf(type: Block['type']): HeadingType | null {
  return type === 'h1' || type === 'h2' || type === 'h3' ? type : null
}

/**
 * The heading level that actually delimits chapters.
 *
 * `# Title` followed by `## Chapter N` is an ordinary way to write a book, and
 * it has exactly one h1 — so splitting on h1 alone returns the whole book as a
 * single chapter. That is not cosmetic: a chapter is the unit held in memory as
 * one PCM buffer before encoding, and the unit that is checkpointed, so one
 * chapter means a multi-gigabyte allocation and a closed tab losing the book
 * rather than a chapter. The delimiter is therefore the shallowest level that
 * actually repeats — h1 when the book has many h1s, h2 when it has one h1 and
 * many h2s.
 */
export function chapterHeadingLevel(counts: HeadingCounts): HeadingType {
  return (
    HEADING_TYPES.find((type) => counts[type] >= 2) ??
    HEADING_TYPES.find((type) => counts[type] > 0) ??
    'h1'
  )
}

/** True when a heading at `type` opens a chapter rather than a section. */
function startsChapter(type: HeadingType, level: HeadingType): boolean {
  return HEADING_TYPES.indexOf(type) <= HEADING_TYPES.indexOf(level)
}

/**
 * Characters XML 1.0 forbids outright.
 *
 * A NUL is not merely noise the TTS engine reads as garbage — the narrated book
 * is written back out as XHTML, and a single one of these makes that document
 * unparseable. This is the one place every byte-sourced text passes through.
 */
// Matching control characters is the entire point of this pattern.
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML = /[\0-\x08\x0B\x0C\x0E-\x1F]/g

/**
 * The encoding of a text file, from its BOM where it has one.
 *
 * Windows Notepad still writes "Unicode" .txt as UTF-16, and a BOM-less UTF-16
 * file decoded as UTF-8 becomes text with a NUL between every letter. Without
 * a BOM the NULs themselves give it away: ASCII in UTF-16 puts one in every
 * second byte, on the low side for little-endian and the high side for big.
 */
export function detectEncoding(bytes: Uint8Array): 'utf-8' | 'utf-16le' | 'utf-16be' {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  }

  const probe = Math.min(bytes.length, 1024)
  // Too few bytes to read a pattern out of; a file that short is ASCII or has
  // a BOM, and guessing UTF-16 off one stray NUL would mangle it.
  if (probe < 16) return 'utf-8'

  let atEven = 0
  let atOdd = 0
  for (let i = 0; i < probe; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) atEven++
      else atOdd++
    }
  }

  // A quarter of the sampled bytes being NUL, essentially all on one side, is
  // UTF-16 and nothing else. Real UTF-8 prose has no NULs at all.
  const decisive = probe / 4
  if (atOdd >= decisive && atEven * 4 < atOdd) return 'utf-16le'
  if (atEven >= decisive && atOdd * 4 < atEven) return 'utf-16be'
  return 'utf-8'
}

/**
 * Bytes -> text for the formats that carry no encoding declaration.
 *
 * A bare `new TextDecoder()` is always UTF-8, which silently mangles both of
 * the other shapes books actually arrive in: UTF-16 (see `detectEncoding`) and
 * legacy single-byte text, where a Windows-1252 curly apostrophe would turn
 * into a replacement character. Invalid UTF-8 is therefore retried as
 * Windows-1252 rather than accepted as a page of U+FFFD.
 */
export function decodeText(bytes: Uint8Array): string {
  const encoding = detectEncoding(bytes)

  if (encoding === 'utf-8') {
    try {
      return clean(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      return clean(new TextDecoder('windows-1252').decode(bytes))
    }
  }

  return clean(new TextDecoder(encoding).decode(bytes))
}

function clean(text: string): string {
  return text.replace(ILLEGAL_XML, '')
}

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

const MARKDOWN_HEADING = /^(#{1,3})\s+(.*)$/

export function readPlainText(source: string, fallbackTitle: string): ParsedChapter[] {
  // A classic-Mac file separates its lines with a bare CR. Splitting on LF
  // alone turns such a file into a single one-line "book".
  const lines = source.split(/\r\n|[\n\r]/)

  const counts: HeadingCounts = { h1: 0, h2: 0, h3: 0 }
  for (const raw of lines) {
    const heading = MARKDOWN_HEADING.exec(raw.trim())
    if (heading) counts[headingTypeFor(heading[1].length)]++
  }
  const level = chapterHeadingLevel(counts)

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

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const markdownHeading = MARKDOWN_HEADING.exec(line)
    if (markdownHeading) {
      const [, hashes, text] = markdownHeading
      const type = headingTypeFor(hashes.length)
      // A heading at the level that delimits chapters starts one; deeper ones
      // are sections inside the chapter already open.
      if (startsChapter(type, level) || !current) current = start(text, { type, text })
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
 * Front matter: a fenced key/value block on the very first line, which every
 * Obsidian, Hugo and Jekyll export carries.
 *
 * `marked` lexes `---\ntitle: X\n---` as a thematic break followed by a setext
 * h2 titled "title: X", so left in place the narrator opens the book by reading
 * the file's metadata aloud.
 */
const FRONT_MATTER =
  /^\uFEFF?(---|\+\+\+)[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:\1|\.\.\.)[ \t]*(?:\r?\n|$)/

/** `key:` or `key =` — what separates real front matter from a leading rule. */
const METADATA_KEY = /^[A-Za-z_][\w.-]*[ \t]*[:=]/

function stripFrontMatter(source: string): string {
  const match = FRONT_MATTER.exec(source)
  if (!match) return source

  // A document may simply open with a thematic break and then prose; only a
  // key/value block is metadata, and only metadata may be thrown away.
  const first = (match[2] ?? '').trimStart().split(/\r?\n/)[0] ?? ''
  if (first !== '' && !METADATA_KEY.test(first)) return source

  return source.slice(match[0].length)
}

/**
 * The parts of a `marked` token this reader reads.
 *
 * Declared structurally rather than per token type, so one walk covers the
 * block tokens and the inline tokens beneath them alike.
 */
interface MdToken {
  type?: string
  text?: string
  depth?: number
  codeBlockStyle?: string
  tokens?: MdToken[]
  items?: MdToken[]
  header?: MdCell[]
  rows?: MdCell[][]
}

interface MdCell {
  text?: string
  tokens?: MdToken[]
}

/**
 * The words of a token tree.
 *
 * A token's `text` is raw inline SOURCE, not rendered text: a link arrives as
 * `[the docs](https://example.com/a/b?q=1)` and would be narrated with the URL
 * read out, emphasis keeps its asterisks, and entities stay encoded — the EPUB
 * path decodes those, this one never did. So the tree underneath is walked down
 * to the text instead.
 */
function flatten(token: MdToken): string {
  switch (token.type) {
    // Alt text describes a picture; it is not prose, and the EPUB path does not
    // speak it either.
    case 'image':
      return ''
    case 'br':
    case 'space':
      return ' '
    // Inline markup arrives as its own token — `<em>` here, the words it wraps
    // as the text token after it.
    case 'html':
      return (token.text ?? '').replace(/<[^>]*>/g, '')
    default:
      break
  }

  if (token.items) return token.items.map(flatten).join(' ')
  if (token.tokens && token.tokens.length > 0) return token.tokens.map(flatten).join('')
  return token.text ?? ''
}

/** One token as it will be spoken: flattened, entity-decoded, whitespace collapsed. */
function blockText(token: MdToken): string {
  return normalizeText(flatten(token))
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
  const tokens: MdToken[] = marked.lexer(stripFrontMatter(source))

  const counts: HeadingCounts = { h1: 0, h2: 0, h3: 0 }
  for (const token of tokens) {
    if (token.type === 'heading') counts[headingTypeFor(token.depth ?? 1)]++
  }
  const level = chapterHeadingLevel(counts)

  const chapters: ParsedChapter[] = []
  let current: ParsedChapter | null = null

  const push = (block: Block) => {
    if (!current) {
      current = { title: fallbackTitle, blocks: [], href: `md-${chapters.length}` }
      chapters.push(current)
    }
    current.blocks.push(block)
  }

  const startChapter = (title: string) => {
    current = { title, blocks: [], href: `md-${chapters.length}` }
    chapters.push(current)
  }

  for (const token of tokens) {
    if (token.type === 'heading') {
      const type = headingTypeFor(token.depth ?? 1)
      const text = blockText(token)
      if (startsChapter(type, level)) startChapter(text)
      push({ type, text })
      continue
    }

    if (token.type === 'paragraph' || token.type === 'text') {
      const text = blockText(token)
      if (text) push({ type: 'p', text })
      continue
    }

    if (token.type === 'blockquote') {
      // A quote holds block tokens of its own; each is a quoted block, and
      // running them together would lose the paragraph breaks inside it.
      for (const inner of token.tokens ?? [token]) {
        const text = blockText(inner)
        if (text) push({ type: 'quote', text })
      }
      continue
    }

    if (token.type === 'list') {
      for (const item of token.items ?? []) {
        const text = blockText(item)
        if (text) push({ type: 'list', text })
      }
      continue
    }

    if (token.type === 'table') {
      // A table carries no `text` of its own, so skipping it drops every word
      // in it. A row is spoken as one item, which is how a row reads aloud.
      for (const row of [token.header ?? [], ...(token.rows ?? [])]) {
        const text = row.map(blockText).filter(Boolean).join(', ')
        if (text) push({ type: 'list', text })
      }
      continue
    }

    if (token.type === 'code') {
      // A four-space indent is the standard way to set verse in prose markdown;
      // a fenced block is code, which has nothing worth narrating.
      if (token.codeBlockStyle === 'indented') {
        const text = normalizeText(token.text ?? '')
        if (text) push({ type: 'p', text })
      }
      continue
    }

    if (token.type === 'html') {
      // Prose wrapped in a `<div>` with no blank line after the opening tag
      // lexes as ONE html token CONTAINING the passage, so skipping html drops
      // it whole. The block reader recovers the text — and yields nothing for a
      // bare tag, a comment or an image, which is what those deserve.
      for (const block of extractBlocks(token.text ?? '')) push(block)
      continue
    }
    // hr, space, def: nothing worth narrating.
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

  // Split on the heading level that delimits chapters — a document that styles
  // its title Heading 1 and its chapters Heading 2 has exactly one h1, and
  // splitting on h1 alone would make the whole document one chapter.
  // Everything before the first such heading is chapter 1.
  const counts: HeadingCounts = { h1: 0, h2: 0, h3: 0 }
  for (const block of blocks) {
    const heading = headingLevelOf(block.type)
    if (heading) counts[heading]++
  }
  const level = chapterHeadingLevel(counts)

  const chapters: ParsedChapter[] = []
  let current: ParsedChapter | null = null

  for (const block of blocks) {
    const heading = headingLevelOf(block.type)
    if (heading && startsChapter(heading, level)) {
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
