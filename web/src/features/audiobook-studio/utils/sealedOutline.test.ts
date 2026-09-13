// Opening a sealed book.
//
// The outline is what the studio waits for before it paints anything, and a
// sealed book has no chapter rows left to build it from. It used to be built by
// reading every chapter out of the artifact in turn, which for a three-hundred
// chapter book meant three hundred passes over the whole publication before the
// first word appeared. These tests hold the cost down to something that does
// not grow with the book.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installBlobArrayBuffer } from './testSupport'
import { buildEpubFiles, type ChapterInput } from './epubWrite'
import { sealEpubBytes } from './zip'
import type { BookRecord } from '../types'

installBlobArrayBuffer()

interface Artifact {
  bookId: string
  epub: Blob
  bytes: number
  sealedAt: number
}
interface Outline {
  bookId: string
  chapters: { index: number; title: string; durationSec: number; narrated: boolean }[]
  builtAt: number
}

const artifacts = new Map<string, Artifact>()
const outlines = new Map<string, Outline>()
const books = new Map<string, BookRecord>()

const getArtifact = vi.fn(async (id: string) => artifacts.get(id))
const getOutline = vi.fn(async (id: string) => outlines.get(id))
const putOutline = vi.fn(async (id: string, chapters: Outline['chapters']) => {
  outlines.set(id, { bookId: id, chapters, builtAt: 1 })
})

vi.mock('./db', () => ({
  getArtifact: (id: string) => getArtifact(id),
  getOutline: (id: string) => getOutline(id),
  putOutline: (id: string, chapters: Outline['chapters']) => putOutline(id, chapters),
  getBook: async (id: string) => books.get(id),
  getChapter: async () => undefined,
  getStaging: async () => undefined,
  listChapters: async () => [],
}))

function chapterInput(index: number, title: string, durationSec: number): ChapterInput {
  const id = `c${index}s1`
  const text = `Sentence ${index}.`
  return {
    index,
    title,
    blocks: [
      { type: 'h1', text: title },
      { type: 'p', text },
    ],
    sentences: [
      { id, blockIdx: 1, blockType: 'p', text, chunks: [text], endsBlock: true },
    ],
    timeline: [{ id, text, clipBegin: 0, clipEnd: durationSec }],
    durationSec,
  }
}

const TITLES = [
  'The Salt Road',
  'A Colder Season',
  'What the River Kept',
  'Stone and Water',
  'The Long Way Down',
  'Everything After',
]

/**
 * Sealed archives by chapter count. The contents depend on nothing else, and
 * deflating the same book once per test is the slowest thing in this file.
 */
const sealed = new Map<number, Promise<Uint8Array>>()

function sealedBytes(chapterCount: number): Promise<Uint8Array> {
  const existing = sealed.get(chapterCount)
  if (existing) return existing

  const chapters = Array.from({ length: chapterCount }, (_, i) =>
    chapterInput(i + 1, TITLES[i % TITLES.length], (i + 1) * 10),
  )
  const audio = new Map(
    chapters.map((c) => [c.index, Uint8Array.from({ length: 64 }, (_, i) => (i * c.index) % 251)]),
  )

  const bytes = sealEpubBytes(
    buildEpubFiles(
      { identifier: 'urn:uuid:salt', title: 'Salt', author: 'A. Writer', language: 'en' },
      chapters,
      audio,
    ),
  )
  sealed.set(chapterCount, bytes)
  return bytes
}

/** Seal a real narrated EPUB and register it as book `id`'s artifact. */
async function sealBook(id: string, chapterCount: number): Promise<BookRecord> {
  const bytes = await sealedBytes(chapterCount)
  const epub = new Blob([bytes as unknown as BlobPart], { type: 'application/epub+zip' })

  artifacts.set(id, { bookId: id, epub, bytes: bytes.byteLength, sealedAt: 1 })

  const book = {
    id,
    title: 'Salt',
    author: 'A. Writer',
    language: 'en',
    sourceName: 'salt.epub',
    sourceType: 'epub',
    mode: 'narrated',
    voiceId: 'af_heart',
    status: 'ready',
    chapterCount,
    durationSec: 0,
    createdAt: 1,
    updatedAt: 1,
  } as BookRecord

  books.set(id, book)
  return book
}

/** How many times the archive was sliced while `run` was on the stack. */
async function slices<T>(id: string, run: () => Promise<T>): Promise<[T, number]> {
  const spy = vi.spyOn(artifacts.get(id)!.epub, 'slice')
  try {
    return [await run(), spy.mock.calls.length]
  } finally {
    spy.mockRestore()
  }
}

beforeEach(async () => {
  artifacts.clear()
  outlines.clear()
  books.clear()
  getArtifact.mockClear()
  getOutline.mockClear()
  putOutline.mockClear()
  vi.resetModules()
})

/**
 * A book that arrived already narrated: its own path layout, front matter in
 * the spine that owns no chapter, and an overlay list on the record that is
 * what the reader indexes chapters by.
 */
async function adoptImported(id: string, withNav: boolean): Promise<BookRecord> {
  const smil = (n: number, end: string) => `<?xml version="1.0"?>
<smil xmlns="http://www.w3.org/ns/SMIL"><body><seq>
  <par><text src="c${n}.xhtml#s1"/><audio src="c${n}.mp3" clipBegin="0:00:00.000" clipEnd="${end}"/></par>
</seq></body></smil>`

  const navItem = withNav
    ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    : ''

  const text: Record<string, string> = {
    'META-INF/container.xml':
      '<container><rootfiles><rootfile full-path="EPUB/package.opf"/></rootfiles></container>',
    'EPUB/package.opf': `<?xml version="1.0"?>
<package version="3.0">
  <metadata>
    <meta property="media:duration" refines="#smil-a">0:00:12.000</meta>
    <meta property="media:duration" refines="#smil-b">0:00:34.000</meta>
    <meta property="media:duration">0:00:46.000</meta>
  </metadata>
  <manifest>
    ${navItem}
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="a" href="c1.xhtml" media-type="application/xhtml+xml" media-overlay="smil-a"/>
    <item id="b" href="c2.xhtml" media-type="application/xhtml+xml" media-overlay="smil-b"/>
    <item id="smil-a" href="c1.smil" media-type="application/smil+xml"/>
    <item id="smil-b" href="c2.smil" media-type="application/smil+xml"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="a"/>
    <itemref idref="b"/>
  </spine>
</package>`,
    'EPUB/nav.xhtml':
      '<html><body><nav epub:type="toc"><ol>' +
      '<li><a href="c1.xhtml">Arrival</a></li>' +
      '<li><a href="c2.xhtml">Departure</a></li>' +
      '</ol></nav></body></html>',
    'EPUB/cover.xhtml': '<html><body><h1>Cover</h1></body></html>',
    'EPUB/c1.xhtml': '<html><body><h1><span id="s1">Arrival</span></h1></body></html>',
    'EPUB/c2.xhtml': '<html><body><h1><span id="s1">Departure</span></h1></body></html>',
    'EPUB/c1.smil': smil(1, '0:00:12.000'),
    'EPUB/c2.smil': smil(2, '0:00:34.000'),
  }

  const bytes = await sealEpubBytes({
    text,
    binary: { 'EPUB/c1.mp3': new Uint8Array(32), 'EPUB/c2.mp3': new Uint8Array(32) },
  })

  artifacts.set(id, {
    bookId: id,
    epub: new Blob([bytes as unknown as BlobPart], { type: 'application/epub+zip' }),
    bytes: bytes.byteLength,
    sealedAt: 1,
  })

  const book = {
    id,
    title: 'Adopted',
    author: 'Someone Else',
    language: 'en',
    sourceName: 'adopted.epub',
    sourceType: 'epub3-narrated',
    mode: 'narrated',
    voiceId: 'af_heart',
    status: 'ready',
    chapterCount: 2,
    durationSec: 0,
    overlays: [
      { text: 'EPUB/c1.xhtml', smil: 'EPUB/c1.smil', audio: 'EPUB/c1.mp3' },
      { text: 'EPUB/c2.xhtml', smil: 'EPUB/c2.smil', audio: 'EPUB/c2.mp3' },
    ],
    createdAt: 1,
    updatedAt: 1,
  } as BookRecord

  books.set(id, book)
  return book
}

describe('loadOutline for an imported narrated book', () => {
  it('indexes by the overlay list, so front matter does not shift the chapters', async () => {
    const book = await adoptImported('b1', true)
    const { loadOutline } = await import('./bookSource')

    // The spine's first item is the cover. Reading the outline off the spine
    // would name chapter 1 "Cover" and drop the last chapter entirely.
    expect(await loadOutline(book)).toEqual([
      { index: 0, title: 'Arrival', durationSec: 12, narrated: true },
      { index: 1, title: 'Departure', durationSec: 34, narrated: true },
    ])
  })

  it('reads the chapters when the package has no contents document', async () => {
    const book = await adoptImported('b1', false)
    const { loadOutline } = await import('./bookSource')

    // No nav means no titles worth having — a filename is not a chapter title,
    // so the headings in the chapters themselves are used instead.
    expect(await loadOutline(book)).toEqual([
      { index: 0, title: 'Arrival', durationSec: 12, narrated: true },
      { index: 1, title: 'Departure', durationSec: 34, narrated: true },
    ])
  })
})

describe('loadOutline for a sealed book', () => {
  it('names every chapter and states its length', async () => {
    const book = await sealBook('b1', 3)
    const { loadOutline } = await import('./bookSource')

    expect(await loadOutline(book)).toEqual([
      { index: 0, title: 'The Salt Road', durationSec: 10, narrated: true },
      { index: 1, title: 'A Colder Season', durationSec: 20, narrated: true },
      { index: 2, title: 'What the River Kept', durationSec: 30, narrated: true },
    ])
  })

  it('costs the same for a long book as for a short one', async () => {
    const short = await sealBook('short', 3)
    const long = await sealBook('long', 24)

    const { loadOutline, clearBookCache } = await import('./bookSource')

    const [shortOutline, shortSlices] = await slices('short', () => loadOutline(short))
    clearBookCache('short')
    const [longOutline, longSlices] = await slices('long', () => loadOutline(long))

    expect(shortOutline).toHaveLength(3)
    expect(longOutline).toHaveLength(24)

    // The package document says everything the outline needs, so the reads are
    // the container, the package and the nav — whatever the chapter count.
    // Reading it chapter by chapter would put this well past a hundred.
    expect(longSlices).toBe(shortSlices)
    expect(longSlices).toBeLessThan(20)
  })

  it('stores the outline so opening the book again reads no archive at all', async () => {
    const book = await sealBook('b1', 4)
    const { loadOutline, clearBookCache } = await import('./bookSource')

    const first = await loadOutline(book)
    expect(putOutline).toHaveBeenCalledTimes(1)

    // A fresh session: nothing cached in memory, only what is on disk.
    clearBookCache('b1')
    getArtifact.mockClear()

    const [second, sliceCount] = await slices('b1', () => loadOutline(book))

    expect(second).toEqual(first)
    expect(getArtifact).not.toHaveBeenCalled()
    expect(sliceCount).toBe(0)
  })

  it('falls back to reading chapters when the package disagrees with the record', async () => {
    const book = await sealBook('b1', 3)
    // A source whose chapters are fragments of shared documents has more
    // chapters than the spine has items. Nothing in the package can be indexed
    // by chapter then, so the outline has to come from the chapters themselves.
    const mismatched = { ...book, chapterCount: 99 }

    const { loadOutline } = await import('./bookSource')
    const outline = await loadOutline(mismatched)

    expect(outline).toEqual([
      { index: 0, title: 'The Salt Road', durationSec: 10, narrated: true },
      { index: 1, title: 'A Colder Season', durationSec: 20, narrated: true },
      { index: 2, title: 'What the River Kept', durationSec: 30, narrated: true },
    ])
  })

  it('is empty, and is not stored, when the artifact has been evicted', async () => {
    const book = await sealBook('b1', 3)
    artifacts.delete('b1')

    const { loadOutline } = await import('./bookSource')

    expect(await loadOutline(book)).toEqual([])
    // Storing an empty outline would make the loss permanent: a re-extract puts
    // the artifact back, and the book would still claim to have no chapters.
    expect(putOutline).not.toHaveBeenCalled()
  })
})

describe('reading a sealed book', () => {
  it('reads a chapter without hydrating the archive', async () => {
    const book = await sealBook('b1', 6)
    const { loadChapter } = await import('./bookSource')

    const [chapter, sliceCount] = await slices('b1', () => loadChapter(book, 2))

    expect(chapter!.title).toBe('What the River Kept')
    expect(chapter!.blocks[1].text).toBe('Sentence 3.')
    expect(chapter!.timeline).toEqual([
      { id: 'c3s1', text: 'Sentence 3.', clipBegin: 0, clipEnd: 30 },
    ])
    // The directory, then a header and a body for the XHTML and the SMIL.
    expect(sliceCount).toBeLessThan(10)
  })

  it('plays audio straight out of the stored file', async () => {
    const book = await sealBook('b1', 3)
    const { loadChapterAudio } = await import('./bookSource')

    const audio = await loadChapterAudio(book, 1)

    expect(audio).toBeInstanceOf(Blob)
    expect(audio!.type).toBe('audio/mpeg')
    // A slice of the archive, not a copy of it: the MP3 is 64 bytes and the
    // handle is exactly that long, not the length of the book.
    expect(audio!.size).toBe(64)
  })

  it('reuses the parsed directory across chapters', async () => {
    const book = await sealBook('b1', 6)
    const { loadChapter } = await import('./bookSource')

    const [, first] = await slices('b1', () => loadChapter(book, 0))
    const [, second] = await slices('b1', () => loadChapter(book, 1))

    // The first read pays for the central directory; the second must not.
    expect(second).toBeLessThan(first)
  })
})
