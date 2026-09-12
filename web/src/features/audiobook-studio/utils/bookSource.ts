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

const BLOCK_TAGS = ['h1', 'h2', 'h3', 'p', 'blockquote'] as const

const TAG_TO_BLOCK: Record<string, Block['type']> = {
  h1: 'h1', h2: 'h2', h3: 'h3', p: 'p', blockquote: 'quote',
}

/**
 * Rebuild a chapter from the XHTML and SMIL we wrote.
 *
 * The span ids are the contract between the two documents: a `<par>` whose text
 * reference names a span that is not present would mean a silent gap, so
 * anything unmatched is dropped rather than rendered without timing.
 */
export function parseSealedChapter(
  index: number,
  xhtml: string,
  smil: string,
): Omit<ReadableChapter, 'title'> {
  const blocks: Block[] = []
  const sentences: SentenceSpan[] = []

  findElements(xhtml, [...BLOCK_TAGS]).forEach((element) => {
    const blockIdx = blocks.length
    const spans = findElements(element.inner, ['span'])
    const type = TAG_TO_BLOCK[element.name] ?? 'p'

    const spoken = spans.filter((span) => getAttr(span.attrs, 'id'))
    if (spoken.length === 0) {
      const text = normalizeText(element.inner.replace(/<[^>]*>/g, ''))
      if (text) blocks.push({ type, text })
      return
    }

    const texts = spoken.map((span) => normalizeText(span.inner))
    blocks.push({ type, text: texts.join(' ') })

    spoken.forEach((span, i) => {
      sentences.push({
        id: getAttr(span.attrs, 'id')!,
        blockIdx,
        blockType: type,
        text: texts[i],
        chunks: [texts[i]],
        endsBlock: i === spoken.length - 1,
      })
    })
  })

  const known = new Set(sentences.map((s) => s.id))
  const timeline: TimedSentence[] = []

  for (const par of findElements(smil, ['par'])) {
    const textRef = findElements(par.inner, ['text'])[0]
    const audioRef = findElements(par.inner, ['audio'])[0]
    if (!textRef || !audioRef) continue

    const id = getAttr(textRef.attrs, 'src')?.split('#')[1]
    if (!id || !known.has(id)) continue

    timeline.push({
      id,
      text: sentences.find((s) => s.id === id)?.text ?? '',
      clipBegin: parseClock(getAttr(audioRef.attrs, 'clipBegin') ?? '0'),
      clipEnd: parseClock(getAttr(audioRef.attrs, 'clipEnd') ?? '0'),
    })
  }

  return { index, blocks, sentences, timeline }
}

async function loadFromArtifact(
  bookId: string,
  index: number,
): Promise<ReadableChapter | null> {
  const artifact = await db.getArtifact(bookId)
  if (!artifact) return null

  const id = chapterId(index + 1)
  const textPath = `OEBPS/text/${id}.xhtml`
  const smilPath = `OEBPS/smil/${id}.smil`

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
      const path = `OEBPS/audio/${chapterId(index + 1)}.mp3`
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
