// Where the reader gets its content.
//
// A book being converted is read from `staging`; a sealed book is read from the
// zip. One function decides which, so the reader never has to care — that is
// what lets chapter 1 be readable while chapter 20 is still being narrated.
//
// Sealed books are never hydrated. The artifact is stored as a Blob, so the
// archive's central directory is read once per book and every chapter after
// that is two small slices out of the stored file — opening a 200 MB
// publication costs one chapter's worth of bytes, not all of it. The directory
// is memoised per session but not persisted, keeping the zip the single source
// of truth for content.
//
// The one thing that IS persisted is the outline, because it is the only thing
// the reader needs before it can show anything at all, and deriving it means
// touching the archive once per chapter.

import { createLogger } from '@/lib/logger'
import * as db from './db'
import { resolveHref, titleFromHref } from './epubRead'
import { chapterId, parseClock } from './epubWrite'
import { findElement, findElements, getAttr, normalizeText } from './markup'
import {
  readZipEntry,
  readZipIndex,
  readZipText,
  sliceStoredEntry,
  type ZipIndex,
} from './zip'
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

/** A sealed book's archive, open for entry-at-a-time reading. */
interface ArtifactSource {
  blob: Blob
  index: ZipIndex
}

/**
 * Open archives, keyed by book.
 *
 * The central directory is the same for every read of a book, and parsing it
 * costs a scan of every entry listing — so it is parsed once and kept. Promises
 * rather than values, so two chapters loading at the same time share one parse
 * instead of racing to do it twice.
 */
const artifactSources = new Map<string, Promise<ArtifactSource | null>>()

function openArtifact(bookId: string): Promise<ArtifactSource | null> {
  const open = artifactSources.get(bookId)
  if (open) return open

  const opening = (async () => {
    const artifact = await db.getArtifact(bookId)
    if (!artifact) return null
    return { blob: artifact.epub, index: await readZipIndex(artifact.epub) }
  })().catch((error: unknown) => {
    // A truncated or evicted archive must not be remembered as this book's
    // answer for the rest of the session. Callers treat null as "not in the
    // zip" and fall back to staging, which is the same path a missing entry
    // already takes.
    artifactSources.delete(bookId)
    log.warn(`[${bookId}] artifact could not be opened`, error)
    return null
  })

  artifactSources.set(bookId, opening)
  return opening
}

/**
 * Whether a chapter's content is final and therefore safe to cache.
 *
 * A chapter parsed but not yet narrated has an empty timeline, and narration
 * fills it in later. Caching that version pins the reader to a chapter that can
 * never highlight: the audio arrives, the timings never do, and playback looks
 * like a plain audio file with dead text beside it.
 */
export function isCacheable(book: BookRecord, chapter: ReadableChapter): boolean {
  if (book.mode === 'live') return true
  return chapter.timeline.length > 0
}
/**
 * Chapter audio, as blobs rather than object URLs.
 *
 * This cache deliberately does NOT hand out object URLs. A URL has an owner —
 * the element playing it — and revoking one that is still in use breaks
 * playback with a bare ERR_FILE_NOT_FOUND. Since the cache cannot know when a
 * consumer is finished, it does not create URLs at all: callers make their own
 * and revoke them when their element goes away.
 *
 * Dropping a blob from this map is always safe. Any object URL already made
 * from it keeps the blob alive on its own.
 *
 * A forty-chapter book at ~5 MB a chapter would pin hundreds of megabytes if
 * every chapter stayed resident, so only the neighbourhood of the current
 * chapter is kept — enough for the next-chapter preload and a step backwards.
 */
const AUDIO_CACHE_LIMIT = 3
const audioCache = new Map<string, Blob>()

function rememberAudio(key: string, blob: Blob): void {
  audioCache.set(key, blob)
  while (audioCache.size > AUDIO_CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = audioCache.keys().next()
    if (oldest.done) break
    audioCache.delete(oldest.value)
  }
}

export function clearBookCache(bookId: string): void {
  for (const key of [...chapterCache.keys()]) {
    if (key.startsWith(`${bookId}:`)) chapterCache.delete(key)
  }
  // This runs when a book is re-sealed, and the offsets in a directory parsed
  // from the previous archive point at nothing in the new one. Dropping it is
  // not an optimisation — keeping it would read garbage.
  artifactSources.delete(bookId)
  // Only the cached blob is dropped. Whatever is playing holds its own object
  // URL and keeps its blob alive — this runs after every narrated chapter, so
  // revoking here would cut off the chapter being read while the rest converts.
  for (const key of [...audioCache.keys()]) {
    if (key.startsWith(`${bookId}:`)) audioCache.delete(key)
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
  const source = await openArtifact(bookId)
  if (!source) return null

  const overlay = (await db.getBook(bookId))?.overlays?.[index]
  const id = chapterId(index + 1)
  const textPath = overlay?.text ?? `OEBPS/text/${id}.xhtml`
  const smilPath = overlay?.smil ?? `OEBPS/smil/${id}.smil`

  const [xhtml, smil] = await Promise.all([
    readZipText(source.blob, source.index, textPath),
    readZipText(source.blob, source.index, smilPath),
  ])
  if (!xhtml) return null

  const parsed = parseSealedChapter(index, xhtml, smil ?? '')

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

  if (chapter && isCacheable(book, chapter)) chapterCache.set(key, chapter)
  return chapter
}

/** A chapter's audio, or null when it has not been narrated yet. */
export async function loadChapterAudio(
  book: BookRecord,
  index: number,
): Promise<Blob | null> {
  if (book.mode === 'live') return null

  const key = `${book.id}:${index}`
  const cached = audioCache.get(key)
  if (cached) return cached

  if (book.status === 'ready') {
    const source = await openArtifact(book.id)
    if (source) {
      const path = book.overlays?.[index]?.audio ?? `OEBPS/audio/${chapterId(index + 1)}.mp3`

      // An MP3 is already compressed, so it goes into the archive STORED and
      // comes back out as a slice of the stored file — a handle, never a copy.
      // The chapter being played therefore costs no heap at all. A book zipped
      // elsewhere may have deflated it, and that one has to be inflated.
      const stored = await sliceStoredEntry(source.blob, source.index, path, 'audio/mpeg')
      if (stored) {
        rememberAudio(key, stored)
        return stored
      }

      const inflated = await readZipEntry(source.blob, source.index, path)
      if (inflated) {
        const blob = new Blob([inflated as unknown as BlobPart], { type: 'audio/mpeg' })
        rememberAudio(key, blob)
        return blob
      }
    }
  }

  const staged = await db.getStaging(book.id, 'audio', index)
  if (!staged?.data) return null

  const blob = new Blob([staged.data as unknown as BlobPart], { type: 'audio/mpeg' })
  rememberAudio(key, blob)
  return blob
}

/** Chapter titles by the path they point at, from the EPUB 3 nav document. */
async function navTitles(
  source: ArtifactSource,
  opf: string,
  opfPath: string,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()

  const navItem = findElements(opf, ['item']).find((item) =>
    getAttr(item.attrs, 'properties')?.includes('nav'),
  )
  const href = navItem && getAttr(navItem.attrs, 'href')
  if (!href) return titles

  const navPath = resolveHref(opfPath, href)
  const nav = await readZipText(source.blob, source.index, navPath)
  if (!nav) return titles

  for (const anchor of findElements(nav, ['a'])) {
    const target = getAttr(anchor.attrs, 'href')
    if (!target) continue
    const path = resolveHref(navPath, target)
    const text = normalizeText(stripMarkup(anchor.inner))
    // First mention wins: a contents that points into one document several
    // times is naming sub-sections of it, and the first is the chapter itself.
    if (text && !titles.has(path)) titles.set(path, text)
  }

  return titles
}

/**
 * Every `media:duration` in a package document, keyed by the overlay it refines.
 *
 * Read with a regex rather than with `findElements`, because `<meta>` is a void
 * element in HTML and the tokenizer treats it as one — so it reports no content
 * for it. In a package document the content is the whole value, and this is the
 * only place that needs it.
 */
function durationsByOverlay(opf: string): Map<string, number> {
  const durations = new Map<string, number>()

  for (const [, attrs, value] of opf.matchAll(/<meta\b([^>]*)>([^<]*)<\/meta\s*>/gi)) {
    if (getAttr(attrs, 'property') !== 'media:duration') continue
    // The one with no `refines` is the book's total and belongs to no chapter.
    const refines = getAttr(attrs, 'refines')
    if (!refines?.startsWith('#')) continue
    durations.set(refines.slice(1), parseClock(value.trim()))
  }

  return durations
}

/** Longest `clipEnd` in an overlay — the length of the chapter it plays. */
async function durationFromSmil(source: ArtifactSource, path: string | undefined): Promise<number> {
  if (!path) return 0
  const smil = await readZipText(source.blob, source.index, path)
  if (!smil) return 0

  let end = 0
  for (const audio of findElements(smil, ['audio'])) {
    end = Math.max(end, parseClock(getAttr(audio.attrs, 'clipEnd') ?? '0'))
  }
  return end
}

/**
 * The outline read from the package document, in two entry reads.
 *
 * An EPUB 3 with media overlays already states everything the outline needs:
 * the spine gives chapter order, a `media:duration` meta gives each chapter's
 * length, and the nav document gives the titles. Reading those three is the
 * difference between two reads and three hundred.
 *
 * Returns null when the package cannot be lined up with the book record — a
 * source whose chapters are fragments of a shared document has more chapters
 * than documents, and a package with no contents document has no titles to
 * give. Those books fall back to reading their chapters one at a time.
 */
async function outlineFromPackage(book: BookRecord): Promise<ChapterOutline[] | null> {
  const source = await openArtifact(book.id)
  if (!source) return null

  const container = await readZipText(source.blob, source.index, 'META-INF/container.xml')
  const rootfile = container ? findElement(container, 'rootfile') : undefined
  const opfPath = (rootfile && getAttr(rootfile.attrs, 'full-path')) || 'OEBPS/package.opf'

  const opf = await readZipText(source.blob, source.index, opfPath)
  if (!opf) return null

  const manifest = new Map<string, { path: string; overlay?: string }>()
  for (const item of findElements(opf, ['item'])) {
    const id = getAttr(item.attrs, 'id')
    const href = getAttr(item.attrs, 'href')
    if (!id || !href) continue
    manifest.set(id, {
      path: resolveHref(opfPath, href),
      overlay: getAttr(item.attrs, 'media-overlay'),
    })
  }
  const idByPath = new Map([...manifest].map(([id, item]) => [item.path, id]))

  /**
   * The book's chapters, in the order the rest of the reader indexes them.
   *
   * An imported book's chapter `i` is `book.overlays[i]`, not its `i`th spine
   * item — its spine also carries front matter, which owns no chapter. A book
   * we sealed ourselves has no overlay list and a spine of nothing but
   * chapters, so there the spine is the answer.
   */
  const entries = book.overlays
    ? book.overlays.map((overlay) => ({
        path: overlay.text,
        smilId: idByPath.get(overlay.smil),
        smilPath: overlay.smil,
      }))
    : findElements(opf, ['itemref'])
        .map((ref) => manifest.get(getAttr(ref.attrs, 'idref') ?? ''))
        .filter((item) => item !== undefined)
        .map((item) => ({
          path: item.path,
          smilId: item.overlay,
          smilPath: item.overlay ? manifest.get(item.overlay)?.path : undefined,
        }))

  if (entries.length !== book.chapterCount) return null

  const titles = await navTitles(source, opf, opfPath)
  // Without a contents document there is nothing here worth calling a title —
  // a filename is not one. Reading the chapters gives real headings.
  if (titles.size === 0) return null

  const durations = durationsByOverlay(opf)

  const outline: ChapterOutline[] = []
  for (const [index, entry] of entries.entries()) {
    // A package that names its overlays but not their lengths still has them
    // in the overlays themselves; only the missing ones are read.
    const stated = entry.smilId ? (durations.get(entry.smilId) ?? 0) : 0
    const durationSec = stated || (await durationFromSmil(source, entry.smilPath))

    outline.push({
      index,
      title: titles.get(entry.path) || titleFromHref(entry.path) || `Chapter ${index + 1}`,
      durationSec,
      narrated: Boolean(entry.smilPath),
    })
  }

  return outline
}

/**
 * The outline read chapter by chapter — the fallback when the package does not
 * line up with the record.
 *
 * Still one pass per chapter, but each pass is now two small entries sliced out
 * of the stored archive rather than a deserialisation of the whole book. The
 * result is persisted, so this runs once in a book's life rather than on every
 * open.
 */
async function outlineByChapter(book: BookRecord): Promise<ChapterOutline[]> {
  const outline: ChapterOutline[] = []

  for (let index = 0; index < book.chapterCount; index++) {
    // Deliberately not `loadChapter`: this walks the whole book, and seeding
    // the chapter cache with all of it would pin every chapter's prose in
    // memory to build a list of titles.
    const chapter = await loadFromArtifact(book.id, index)
    if (!chapter) break
    outline.push({
      index,
      title: chapter.title,
      durationSec: chapter.timeline.at(-1)?.clipEnd ?? 0,
      narrated: chapter.timeline.length > 0,
    })
  }

  return outline
}

/**
 * Chapter list for the reader's navigation, including not-yet-narrated ones.
 *
 * This is on the path to the first paint — the studio waits for it before it
 * shows anything — so a sealed book's outline is stored once and read back
 * afterwards. Deriving it is cheap now and was not always, and either way it is
 * work with a known answer.
 */
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

  // Sealed books have no chapter rows left. `putArtifact` drops the stored
  // outline whenever the archive is replaced, so a hit here always describes
  // the archive currently on disk.
  const stored = await db.getOutline(book.id)
  if (stored && stored.chapters.length > 0) return stored.chapters

  const outline = (await outlineFromPackage(book)) ?? (await outlineByChapter(book))
  if (outline.length > 0) await db.putOutline(book.id, outline)

  log.log(`[${book.id}] outline rebuilt from artifact — ${outline.length} chapters`)
  return outline
}

/**
 * The sealed publication, for download. Null until the book is sealed.
 *
 * The stored Blob is handed straight out. Copying it would mean pulling the
 * whole book onto the heap for a download the browser can stream from disk.
 */
export async function loadArtifactBlob(bookId: string): Promise<Blob | null> {
  const artifact = await db.getArtifact(bookId)
  return artifact?.epub ?? null
}

/**
 * Every chapter of a view, in document order.
 *
 * A branch selection puts a whole section on one page, so its chapters are
 * loaded together. Chapters that are not readable yet are skipped rather than
 * leaving holes in the page.
 */
export async function loadView(
  book: BookRecord,
  leaves: number[],
): Promise<ReadableChapter[]> {
  const loaded = await Promise.all(leaves.map((index) => loadChapter(book, index)))
  return loaded.filter((chapter): chapter is ReadableChapter => chapter !== null)
}
