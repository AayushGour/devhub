import { describe, it, expect } from 'vitest'
import { buildSentences, splitSentences, subSplit } from './sentences'
import { findSentenceAt, wordSpanAt, type TimedSentence } from './timeline'
import { buildChapterXhtml, buildEpubFiles, formatClock, type ChapterInput } from './epubWrite'
import { sealEpubBytes, listEntries, readTextEntry } from './zip'

describe('sentences', () => {
  it('does not break on abbreviations or initials', () => {
    const out = splitSentences('Dr. Smith met J. R. R. Tolkien. They spoke for an hour.')
    expect(out).toEqual([
      'Dr. Smith met J. R. R. Tolkien.',
      'They spoke for an hour.',
    ])
  })

  it('sub-splits past the chunk limit at the least disruptive boundary', () => {
    const long = `${'alpha bravo charlie delta echo '.repeat(20)}; ${'foxtrot golf '.repeat(20)}`
    const chunks = subSplit(long, 400)
    expect(chunks.length).toBeGreaterThan(1)
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(400)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' ').trim())
  })

  it('assigns stable ids and marks block ends', () => {
    const spans = buildSentences([
      { type: 'h1', text: 'Chapter One' },
      { type: 'p', text: 'First. Second.' },
    ])
    expect(spans.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(spans[2].endsBlock).toBe(true)
    expect(spans[1].endsBlock).toBe(false)
  })
})

describe('timeline', () => {
  const timeline: TimedSentence[] = [
    { id: 's1', text: 'One two three.', clipBegin: 0, clipEnd: 2 },
    { id: 's2', text: 'Four five six.', clipBegin: 2.2, clipEnd: 4 },
  ]

  it('finds the active sentence and holds it through the gap', () => {
    expect(findSentenceAt(timeline, -1)).toBe(-1)
    expect(findSentenceAt(timeline, 0)).toBe(0)
    expect(findSentenceAt(timeline, 1.9)).toBe(0)
    expect(findSentenceAt(timeline, 2.1)).toBe(0) // silence between clips
    expect(findSentenceAt(timeline, 2.3)).toBe(1)
    expect(findSentenceAt(timeline, 99)).toBe(1)
  })

  it('interpolates the word position across the sentence', () => {
    const s = timeline[0]
    expect(wordSpanAt(s, 0)).toEqual({ start: 0, end: 3 })      // "One"
    expect(wordSpanAt(s, 1.99)).toEqual({ start: 8, end: 14 })  // "three."
  })
})

describe('epub3 output', () => {
  it('formats SMIL clock values to millisecond precision', () => {
    expect(formatClock(0)).toBe('0:00:00.000')
    expect(formatClock(72.48)).toBe('0:01:12.480')
    expect(formatClock(3661.5)).toBe('1:01:01.500')
  })

  it('wraps consecutive list items in a single list', () => {
    const blocks = [
      { type: 'p' as const, text: 'They carried two things.' },
      { type: 'list' as const, text: 'Salt' },
      { type: 'list' as const, text: 'Gold' },
      { type: 'p' as const, text: 'And nothing else.' },
    ]
    const sentences = buildSentences(blocks)
    const xhtml = buildChapterXhtml(
      {
        index: 1,
        title: 'One',
        blocks,
        sentences,
        timeline: [],
        durationSec: 0,
      },
      'en',
    )

    // One list holding both items — a bare <li> is invalid and loses the list.
    expect((xhtml.match(/<ul>/g) ?? [])).toHaveLength(1)
    expect((xhtml.match(/<li>/g) ?? [])).toHaveLength(2)
    const list = /<ul>([\s\S]*?)<\/ul>/.exec(xhtml)?.[1] ?? ''
    expect(list).toContain('Salt')
    expect(list).toContain('Gold')
    // The paragraphs stay outside it.
    expect(list).not.toContain('And nothing else')
    expect(list).not.toContain('They carried two things')
  })

  it('seals a structurally valid publication', async () => {
    const blocks = [
      { type: 'h1' as const, text: 'Chapter One' },
      { type: 'p' as const, text: 'The caravans moved at night. The sand was cold.' },
    ]
    const sentences = buildSentences(blocks)
    const timeline: TimedSentence[] = sentences.map((s, i) => ({
      id: s.id,
      text: s.text,
      clipBegin: i * 2,
      clipEnd: i * 2 + 1.8,
    }))

    const chapter: ChapterInput = {
      index: 1,
      title: 'Chapter One',
      blocks,
      sentences,
      timeline,
      durationSec: timeline[timeline.length - 1].clipEnd,
    }

    const files = buildEpubFiles(
      { identifier: 'urn:uuid:test', title: 'Salt Roads', author: 'A. Author', language: 'en' },
      [chapter],
      new Map([[1, new Uint8Array([0xff, 0xfb, 0x90, 0x00])]]),
      '2026-09-12T00:00:00Z',
    )

    const archive = await sealEpubBytes(files)
    const entries = await listEntries(archive)

    // Rule 1: mimetype must be the first entry in the archive.
    expect(entries[0]).toBe('mimetype')
    expect(entries).toEqual(
      expect.arrayContaining([
        'META-INF/container.xml',
        'OEBPS/package.opf',
        'OEBPS/nav.xhtml',
        'OEBPS/text/ch001.xhtml',
        'OEBPS/smil/ch001.smil',
        'OEBPS/audio/ch001.mp3',
      ]),
    )

    const opf = (await readTextEntry(archive, 'OEBPS/package.opf'))!
    expect(opf).toContain('media-overlay="smil-ch001"')
    expect(opf).toContain(
      `<meta property="media:duration" refines="#smil-ch001">${formatClock(chapter.durationSec)}</meta>`,
    )
    expect(opf).toContain('<meta property="media:active-class">-epub-media-overlay-active</meta>')
    expect(opf).toContain('media-type="application/smil+xml"')

    const smil = (await readTextEntry(archive, 'OEBPS/smil/ch001.smil'))!
    const xhtml = (await readTextEntry(archive, 'OEBPS/text/ch001.xhtml'))!

    // Every SMIL text ref must resolve to a span that exists in the XHTML.
    const refs = [...smil.matchAll(/ch001\.xhtml#(s\d+)/g)].map((m) => m[1])
    expect(refs.length).toBe(sentences.length)
    for (const id of refs) expect(xhtml).toContain(`id="${id}"`)

    // Both documents must be well-formed XML.
    for (const [label, source] of [['opf', opf], ['smil', smil], ['xhtml', xhtml]] as const) {
      const doc = new DOMParser().parseFromString(source, 'application/xml')
      expect(doc.querySelector('parsererror'), `${label} is not well-formed`).toBeNull()
    }
  })
})
