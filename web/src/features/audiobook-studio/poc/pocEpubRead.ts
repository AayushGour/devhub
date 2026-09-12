// Minimal EPUB reader — POC scaffolding only.
//
// Unzips the whole archive and pulls blocks out of every spine document. The
// real implementation (utils/epubRead.ts, Phase 2) adds DOMPurify sanitising,
// EPUB2 NCX handling, DRM detection, streaming extraction, and cover art. This
// exists so the POC can exercise a real multi-chapter book end to end.

import { unzip, strFromU8, type Unzipped } from 'fflate'
import type { Block } from '../utils/sentences'

export interface PocChapter {
  title: string
  blocks: Block[]
}

export interface PocBook {
  title: string
  author: string
  language: string
  chapters: PocChapter[]
}

const BLOCK_SELECTOR = 'h1, h2, h3, p, blockquote, li'

const TAG_TO_BLOCK: Record<string, Block['type']> = {
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  P: 'p',
  BLOCKQUOTE: 'quote',
  LI: 'list',
}

function unzipAll(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (err, files) => (err ? reject(err) : resolve(files)))
  })
}

function textOf(files: Unzipped, path: string): string | null {
  const entry = files[path]
  return entry ? strFromU8(entry) : null
}

/** Resolve an href that is relative to the OPF against the archive root. */
function resolveFromOpf(opfPath: string, href: string): string {
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const joined = `${base}${href}`

  // Collapse any ../ segments the manifest used.
  const parts: string[] = []
  for (const segment of joined.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

function parseXml(source: string, mime: DOMParserSupportedType): Document {
  return new DOMParser().parseFromString(source, mime)
}

export async function readEpub(file: File): Promise<PocBook> {
  const files = await unzipAll(new Uint8Array(await file.arrayBuffer()))

  if (files['META-INF/encryption.xml']) {
    throw new Error('This EPUB is DRM-protected and cannot be converted.')
  }

  const containerXml = textOf(files, 'META-INF/container.xml')
  if (!containerXml) throw new Error('Not a valid EPUB: META-INF/container.xml is missing.')

  const opfPath = parseXml(containerXml, 'application/xml')
    .querySelector('rootfile')
    ?.getAttribute('full-path')
  if (!opfPath) throw new Error('Not a valid EPUB: no rootfile in container.xml.')

  const opfXml = textOf(files, opfPath)
  if (!opfXml) throw new Error(`Not a valid EPUB: ${opfPath} is missing.`)
  const opf = parseXml(opfXml, 'application/xml')

  const hrefById = new Map<string, string>()
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) hrefById.set(id, resolveFromOpf(opfPath, href))
  })

  const chapters: PocChapter[] = []

  opf.querySelectorAll('spine > itemref').forEach((ref) => {
    const href = hrefById.get(ref.getAttribute('idref') ?? '')
    if (!href) return

    const source = textOf(files, href)
    if (!source) return

    // Parsed as HTML rather than XHTML so a malformed document degrades
    // instead of throwing — plenty of real EPUBs are not well-formed XML.
    const doc = parseXml(source, 'text/html')

    const blocks: Block[] = []
    doc.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!text) return
      blocks.push({ type: TAG_TO_BLOCK[el.tagName] ?? 'p', text })
    })

    if (blocks.length === 0) return

    const heading = blocks.find((b) => b.type.startsWith('h'))
    chapters.push({
      title: heading?.text ?? href.split('/').pop() ?? `Chapter ${chapters.length + 1}`,
      blocks,
    })
  })

  if (chapters.length === 0) throw new Error('No readable text found in this EPUB.')

  const meta = (name: string) =>
    opf.getElementsByTagName(`dc:${name}`)[0]?.textContent?.trim() ??
    opf.getElementsByTagName(name)[0]?.textContent?.trim() ??
    ''

  return {
    title: meta('title') || file.name.replace(/\.epub$/i, ''),
    author: meta('creator') || 'Unknown',
    language: meta('language') || 'en',
    chapters,
  }
}

/** Split pasted prose into chapters on Markdown-style `#`/`##` heading lines. */
export function readPlainText(text: string, name: string): PocBook {
  const chapters: PocChapter[] = []
  let current: PocChapter | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      current = { title: heading[2], blocks: [{ type: 'h1', text: heading[2] }] }
      chapters.push(current)
      continue
    }

    if (!current) {
      current = { title: name, blocks: [] }
      chapters.push(current)
    }
    current.blocks.push({ type: 'p', text: line })
  }

  return { title: name, author: 'Unknown', language: 'en', chapters }
}
