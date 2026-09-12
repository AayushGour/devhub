// Where the reader gets its content.
//
// A book being converted is read from `staging`; a sealed book is read from the
// zip. One function decides which, so the reader never has to care — that is
// what lets chapter 1 be readable while chapter 20 is still being narrated.
//
// Sealed books are never fully hydrated: `extractEntries` inflates only the
// entries asked for, so opening a 200 MB publication costs one chapter, not all
// of it. The parsed package document is memoised per session but not persisted,
// keeping the zip the single source of truth.

import { createLogger } from '@/lib/logger'
import * as db from './db'
import { chapterId, parseClock } from './epubWrite'
import { findElements, getAttr, normalizeText } from './markup'
import { extractEntries } from './zip'
import type { Block, BookRecord, SentenceSpan, TimedSentence } from '../types'

const log = createLogger('audiobook:source')

export interface ReadableChapter {
  index: number
  title: string
  blocks: Block[]
  sentences: SentenceSpan[]
  timeline: TimedSentence[]
}

export interface ChapterOutline {
  index: number
  title: string
  durationSec: number
  /** False while this chapter is still queued for narration. */
  narrated: boolean
}

/** Session-lifetime cache of inflated chapters, keyed `${bookId}:${index}`. */
const chapterCache = new Map<string, ReadableChapter>()
const audioCache = new Map<string, string>()

export function clearBookCache(bookId: string): void {
  for (const key of [...chapterCache.keys()]) {
    if (key.startsWith(`${bookId}:`)) chapterCache.delete(key)
  }
  for (const [key, url] of [...audioCache.entries()]) {
    if (key.startsWith(`${bookId}:`)) {
      URL.revokeObjectURL(url)
      audioCache.delete(key)
    }
  }
}

const BLOCK_TAGS = ['h1', 'h2', 'h3', 'p', 'blockquote', 'li'] as const

const TAG_TO_BLOCK: Record<string, Block['type']> = {
  h1: 'h1', h2: 'h2', h3: 'h3', p: 'p', blockquote: 'quote', li: 'list',
}

/** Elements an overlay may point at as a single spoken phrase. */
const SPOKEN_TAGS = ['span', 'phrase', 'sent', 'a', 'em', 'strong']

function stripMarkup(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ')
}

/**
 * Rebuild a chapter from its XHTML and SMIL.
 *
 * Driven by the SMIL rather than by the markup, because the overlay is the only
 * thing that knows which elements are spoken units. Our own output puts them on
 * `<span class="s">`; a book narrated elsewhere may put them on the paragraph
 * itself. Anything the overlay does not reference is rendered as plain text —
 * visible, but not clickable and never highlighted, which is honest about the
 * fact that it has no timing.
 */
export function parseSealedChapter(
  index: number,
  xhtml: string,
  smil: string,
): Omit<ReadableChapter, 'title'> {
  const clips = new Map<string, { clipBegin: number; clipEnd: number; order: number }>()

  findElements(smil, ['par']).forEach((par, order) => {
    const textRef = findElements(par.inner, ['text'])[0]
    const audioRef = findElements(par.inner, ['audio'])[0]
    if (!textRef || !audioRef) return

    const id = getAttr(textRef.attrs, 'src')?.split('#')[1]
    if (!id) return

    clips.set(id, {
      clipBegin: parseClock(getAttr(audioRef.attrs, 'clipBegin') ?? '0'),
      clipEnd: parseClock(getAttr(audioRef.attrs, 'clipEnd') ?? '0'),
      order,
    })
  })

  const blocks: Block[] = []
  const sentences: SentenceSpan[] = []

  for (const element of findElements(xhtml, [...BLOCK_TAGS])) {
    const type = TAG_TO_BLOCK[element.name] ?? 'p'
    const blockIdx = blocks.length

    // Spoken units inside this block, in document order.
    const inner = findElements(element.inner, SPOKEN_TAGS).filter((child) => {
      const id = getAttr(child.attrs, 'id')
      return id !== undefined && clips.has(id)
    })

    const ownId = getAttr(element.attrs, 'id')
    const blockIsOwnUnit = inner.length === 0 && ownId !== undefined && clips.has(ownId)

    if (inner.length === 0 && !blockIsOwnUnit) {
      const text = normalizeText(stripMarkup(element.inner))
      if (text) blocks.push({ type, text })
      continue
    }

    const units = blockIsOwnUnit
      ? [{ id: ownId!, text: normalizeText(stripMarkup(element.inner)) }]
      : inner.map((child) => ({
          id: getAttr(child.attrs, 'id')!,
          text: normalizeText(stripMarkup(child.inner)),
        }))

    blocks.push({ type, text: units.map((unit) => unit.text).join(' ') })

    units.forEach((unit, i) => {
      sentences.push({
        id: unit.id,
        blockIdx,
        blockType: type,
        text: unit.text,
        chunks: [unit.text],
        endsBlock: i === units.length - 1,
      })
    })
  }

  const byId = new Map(sentences.map((sentence) => [sentence.id, sentence]))

  const timeline: TimedSentence[] = [...clips.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, clip]) => ({
      id,
      text: byId.get(id)!.text,
      clipBegin: clip.clipBegin,
      clipEnd: clip.clipEnd,
    }))

  return { index, blocks, sentences, timeline }
}

async function loadFromArtifact(
  bookId: string,
  index: number,
): Promise<ReadableChapter | null> {
  const artifact = await db.getArtifact(bookId)
  if (!artifact) return null

  const overlay = (await db.getBook(bookId))?.overlays?.[index]
  const id = chapterId(index + 1)
  const textPath = overlay?.text ?? `OEBPS/text/${id}.xhtml`
  const smilPath = overlay?.smil ?? `OEBPS/smil/${id}.smil`

  const files = await extractEntries(
    artifact.epub,
    (name) => name === textPath || name === smilPath,
  )
  if (!files[textPath]) return null

  const decoder = new TextDecoder()
  const parsed = parseSealedChapter(
    index,
    decoder.decode(files[textPath]),
    files[smilPath] ? decoder.decode(files[smilPath]) : '',
  )

  const heading = parsed.blocks.find((b) => b.type.startsWith('h'))
  return { ...parsed, title: heading?.text ?? `Chapter ${index + 1}` }
}

/** Chapter content, from whichever store currently holds it. */
export async function loadChapter(
  book: BookRecord,
  index: number,
): Promise<ReadableChapter | null> {
  const key = `${book.id}:${index}`
  const cached = chapterCache.get(key)
  if (cached) return cached

  let chapter: ReadableChapter | null = null

  if (book.status === 'ready' && book.mode === 'narrated') {
    chapter = await loadFromArtifact(book.id, index)
  }

  // Staging is the fallback for everything: a book mid-conversion, a live book
  // that has no artifact at all, and a sealed book whose entry went missing.
  if (!chapter) {
    const record = await db.getChapter(book.id, index)
    if (record) {
      chapter = {
        index,
        title: record.title,
        blocks: record.blocks,
        sentences: record.sentences,
        timeline: record.timeline,
      }
    }
  }

  if (chapter) chapterCache.set(key, chapter)
  return chapter
}

/** An object URL for a chapter's audio, or null when it is not narrated yet. */
export async function loadChapterAudio(
  book: BookRecord,
  index: number,
): Promise<string | null> {
  if (book.mode === 'live') return null

  const key = `${book.id}:${index}`
  const cached = audioCache.get(key)
  if (cached) return cached

  let bytes: Uint8Array | null = null

  if (book.status === 'ready') {
    const artifact = await db.getArtifact(book.id)
    if (artifact) {
      const path = book.overlays?.[index]?.audio ?? `OEBPS/audio/${chapterId(index + 1)}.mp3`
      const files = await extractEntries(artifact.epub, (name) => name === path)
      bytes = files[path] ?? null
    }
  }

  if (!bytes) {
    const staged = await db.getStaging(book.id, 'audio', index)
    bytes = staged?.data ?? null
  }

  if (!bytes) return null

  const url = URL.createObjectURL(
    new Blob([bytes as unknown as BlobPart], { type: 'audio/mpeg' }),
  )
  audioCache.set(key, url)
  return url
}

/** Chapter list for the reader's navigation, including not-yet-narrated ones. */
export async function loadOutline(book: BookRecord): Promise<ChapterOutline[]> {
  const records = await db.listChapters(book.id)

  if (records.length > 0) {
    return records.map((record) => ({
      index: record.index,
      title: record.title,
      durationSec: record.durationSec,
      narrated: book.mode === 'live' || record.timeline.length > 0,
    }))
  }

  // Sealed books have no chapter rows left — derive the outline from the zip.
  const outline: ChapterOutline[] = []
  for (let index = 0; index < book.chapterCount; index++) {
    const chapter = await loadChapter(book, index)
    if (!chapter) break
    outline.push({
      index,
      title: chapter.title,
      durationSec: chapter.timeline.at(-1)?.clipEnd ?? 0,
      narrated: chapter.timeline.length > 0,
    })
  }

  log.log(`[${book.id}] outline rebuilt from artifact — ${outline.length} chapters`)
  return outline
}

/** The sealed publication, for download. Null until the book is sealed. */
export async function loadArtifactBlob(bookId: string): Promise<Blob | null> {
  const artifact = await db.getArtifact(bookId)
  if (!artifact) return null
  return new Blob([artifact.epub as unknown as BlobPart], { type: 'application/epub+zip' })
}
