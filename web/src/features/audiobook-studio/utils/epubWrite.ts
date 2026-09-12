// EPUB 3 + Media Overlays writer.
//
// Produces the five document kinds a synced audiobook needs:
//   container.xml  -> points at the package document
//   package.opf    -> manifest, spine, and the media-overlay wiring
//   nav.xhtml      -> the EPUB 3 table of contents
//   ch*.xhtml      -> prose with one <span id> per sentence (the sync anchors)
//   ch*.smil       -> <par> per sentence, mapping span id -> audio clip range
//
// Path layout inside the zip (relative refs below depend on it):
//   OEBPS/package.opf   OEBPS/nav.xhtml      OEBPS/styles/read.css
//   OEBPS/text/chNNN.xhtml   OEBPS/audio/chNNN.mp3   OEBPS/smil/chNNN.smil

import type { Block, SentenceSpan } from './sentences'
import type { TimedSentence } from './timeline'

export interface BookMeta {
  /** Unique publication identifier; any stable opaque string. */
  identifier: string
  title: string
  author: string
  language: string
}

export interface ChapterInput {
  /** 1-based; formats to chNNN throughout the package. */
  index: number
  title: string
  blocks: Block[]
  sentences: SentenceSpan[]
  timeline: TimedSentence[]
  /** Duration of this chapter's audio file, in seconds. */
  durationSec: number
}

/** Media Overlays active-class. Readers add it to the playing element. */
export const ACTIVE_CLASS = '-epub-media-overlay-active'

export function chapterId(index: number): string {
  return `ch${String(index).padStart(3, '0')}`
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * SMIL clock value: `H:MM:SS.mmm`.
 * Millisecond precision is what makes sentence highlighting land on the word
 * rather than near it, so this never rounds to whole seconds.
 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const totalMs = Math.round(safe * 1000)
  const ms = totalMs % 1000
  const totalSec = (totalMs - ms) / 1000
  const s = totalSec % 60
  const totalMin = (totalSec - s) / 60
  const m = totalMin % 60
  const h = (totalMin - m) / 60

  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${h}:${pad2(m)}:${pad2(s)}.${String(ms).padStart(3, '0')}`
}

/** Inverse of `formatClock`. Accepts `H:MM:SS.mmm`, `MM:SS`, and bare seconds. */
export function parseClock(value: string): number {
  const trimmed = value.trim().replace(/s$/, '')
  const parts = trimmed.split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return 0

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

export function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
}

export const READ_CSS = `html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, "Iowan Old Style", serif;
  font-size: 1rem;
  line-height: 1.65;
  padding: 1.5rem;
}
h1, h2, h3 { line-height: 1.25; margin: 2rem 0 1rem; }
p { margin: 0 0 1rem; }
blockquote { margin: 0 0 1rem 1.5rem; font-style: italic; }
span.s { }
.${ACTIVE_CLASS} {
  background-color: rgba(255, 214, 10, 0.35);
  border-radius: 0.15rem;
}
`

const BLOCK_TAG: Record<Block['type'], string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  p: 'p',
  quote: 'blockquote',
  list: 'p',
}

/**
 * Chapter prose with every sentence wrapped in `<span class="s" id="...">`.
 * Those ids are the only contract between the text and the overlay — the SMIL
 * `<text src="...#id">` values must match them exactly.
 */
export function buildChapterXhtml(chapter: ChapterInput, language: string): string {
  const byBlock = new Map<number, SentenceSpan[]>()
  for (const sentence of chapter.sentences) {
    const list = byBlock.get(sentence.blockIdx)
    if (list) list.push(sentence)
    else byBlock.set(sentence.blockIdx, [sentence])
  }

  const body = chapter.blocks
    .map((block, idx) => {
      const tag = BLOCK_TAG[block.type]
      const sentences = byBlock.get(idx) ?? []

      // A block with no sentences (e.g. whitespace-only) still renders, so
      // block indices stay aligned with what the parser produced.
      const inner = sentences.length
        ? sentences
            .map((s) => `<span class="s" id="${s.id}">${escapeXml(s.text)}</span>`)
            .join(' ')
        : escapeXml(block.text)

      return `    <${tag}>${inner}</${tag}>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/read.css"/>
  </head>
  <body>
    <section epub:type="chapter">
${body}
    </section>
  </body>
</html>
`
}

/** The overlay: one `<par>` per sentence, in playback order. */
export function buildSmil(chapter: ChapterInput): string {
  const id = chapterId(chapter.index)
  const textHref = `../text/${id}.xhtml`
  const audioHref = `../audio/${id}.mp3`

  const pars = chapter.timeline
    .map(
      (sentence, i) => `      <par id="p${i + 1}">
        <text src="${textHref}#${sentence.id}"/>
        <audio src="${audioHref}" clipBegin="${formatClock(sentence.clipBegin)}" clipEnd="${formatClock(sentence.clipEnd)}"/>
      </par>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">
  <body>
    <seq id="seq-${id}" epub:textref="${textHref}">
${pars}
    </seq>
  </body>
</smil>
`
}

export function buildNavXhtml(meta: BookMeta, chapters: ChapterInput[]): string {
  const items = chapters
    .map(
      (c) =>
        `        <li><a href="text/${chapterId(c.index)}.xhtml">${escapeXml(c.title)}</a></li>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(meta.language)}" xml:lang="${escapeXml(meta.language)}">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(meta.title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>
`
}

/**
 * The package document. Three things make the overlay work, and all three are
 * required — readers silently fall back to a silent book if any is missing:
 *   1. each content doc's `media-overlay` attribute naming its SMIL item id
 *   2. a `media:duration` refining each SMIL item, plus one total with no refines
 *   3. `media:active-class`, which tells the reader what to style while playing
 */
export function buildPackageOpf(
  meta: BookMeta,
  chapters: ChapterInput[],
  modified: string,
): string {
  const totalDuration = chapters.reduce((sum, c) => sum + c.durationSec, 0)

  const durationMetas = chapters
    .map(
      (c) =>
        `    <meta property="media:duration" refines="#smil-${chapterId(c.index)}">${formatClock(c.durationSec)}</meta>`,
    )
    .join('\n')

  const manifestItems = chapters
    .flatMap((c) => {
      const id = chapterId(c.index)
      return [
        `    <item id="${id}" href="text/${id}.xhtml" media-type="application/xhtml+xml" media-overlay="smil-${id}"/>`,
        `    <item id="audio-${id}" href="audio/${id}.mp3" media-type="audio/mpeg"/>`,
        `    <item id="smil-${id}" href="smil/${id}.smil" media-type="application/smil+xml"/>`,
      ]
    })
    .join('\n')

  const spineItems = chapters
    .map((c) => `    <itemref idref="${chapterId(c.index)}"/>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXml(meta.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(meta.identifier)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:creator>${escapeXml(meta.author)}</dc:creator>
    <dc:language>${escapeXml(meta.language)}</dc:language>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
    <meta property="media:active-class">${ACTIVE_CLASS}</meta>
    <meta property="media:duration">${formatClock(totalDuration)}</meta>
${durationMetas}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/read.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`
}

export interface EpubFiles {
  /** Path inside the zip -> file contents. */
  text: Record<string, string>
  /** Path inside the zip -> binary contents (the MP3s). */
  binary: Record<string, Uint8Array>
}

/**
 * Assemble every file of the publication except `mimetype`, which the zip
 * writer must place first and store uncompressed.
 */
export function buildEpubFiles(
  meta: BookMeta,
  chapters: ChapterInput[],
  audioByChapter: Map<number, Uint8Array>,
  modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
): EpubFiles {
  const text: Record<string, string> = {
    'META-INF/container.xml': buildContainerXml(),
    'OEBPS/package.opf': buildPackageOpf(meta, chapters, modified),
    'OEBPS/nav.xhtml': buildNavXhtml(meta, chapters),
    'OEBPS/styles/read.css': READ_CSS,
  }
  const binary: Record<string, Uint8Array> = {}

  for (const chapter of chapters) {
    const id = chapterId(chapter.index)
    text[`OEBPS/text/${id}.xhtml`] = buildChapterXhtml(chapter, meta.language)
    text[`OEBPS/smil/${id}.smil`] = buildSmil(chapter)

    const audio = audioByChapter.get(chapter.index)
    if (!audio) throw new Error(`missing audio for chapter ${chapter.index}`)
    binary[`OEBPS/audio/${id}.mp3`] = audio
  }

  return { text, binary }
}
