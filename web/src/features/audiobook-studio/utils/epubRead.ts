// EPUB 2 / EPUB 3 reader.
//
// Recovers the publication's metadata, spine order, chapter text and cover,
// and reports whether the book already carries Media Overlays — in which case
// it needs no narration at all and is registered as ready to read.

import { unzip, strFromU8, type Unzipped } from 'fflate'
import { findElement, findElements, getAttr, normalizeText, textContent } from './markup'
import { extractBlocks } from './htmlBlocks'
import type { Block } from './sentences'

export interface ParsedChapter {
  title: string
  blocks: Block[]
  /** Path of the source document inside the archive. */
  href: string
}

/** Where a narrated source keeps a chapter's three documents. */
export interface OverlayAssets {
  text: string
  smil: string
  audio: string
}

export interface ParsedBook {
  title: string
  author: string
  language: string
  chapters: ParsedChapter[]
  cover?: { bytes: Uint8Array; mime: string }
  /** True when the source already contains SMIL overlays — skip narration. */
  hasMediaOverlays: boolean
  /**
   * Asset paths per chapter, present only for narrated sources. A foreign EPUB
   * does not use our naming, so the reader needs the manifest's own paths.
   */
  overlays?: OverlayAssets[]
}

export class DrmProtectedError extends Error {
  constructor() {
    super('This EPUB is protected by DRM and cannot be converted.')
    this.name = 'DrmProtectedError'
  }
}

function unzipAll(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (err, files) => (err ? reject(err) : resolve(files)))
  })
}

function readText(files: Unzipped, path: string): string | null {
  const entry = files[path]
  return entry ? strFromU8(entry) : null
}

/** Resolve an href relative to the document that referenced it. */
export function resolveHref(fromPath: string, href: string): string {
  const clean = href.split('#')[0]
  if (!clean) return fromPath

  const base = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : ''
  const parts: string[] = []

  for (const segment of `${base}${clean}`.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

/** Chapter titles from the EPUB 3 nav document or the EPUB 2 NCX, by href. */
function readTocTitles(files: Unzipped, manifest: ManifestItem[]): Map<string, string> {
  const titles = new Map<string, string>()

  const navItem = manifest.find((item) => item.properties?.includes('nav'))
  if (navItem) {
    const source = readText(files, navItem.path)
    if (source) {
      for (const anchor of findElements(source, ['a'])) {
        const href = getAttr(anchor.attrs, 'href')
        const label = textContent(anchor.inner)
        if (href && label) titles.set(resolveHref(navItem.path, href), label)
      }
    }
  }

  const ncxItem = manifest.find((item) => item.mediaType === 'application/x-dtbncx+xml')
  if (ncxItem) {
    const source = readText(files, ncxItem.path)
    if (source) {
      for (const point of findElements(source, ['navPoint'])) {
        const label = textContent(findElement(point.inner, 'text')?.inner ?? '')
        const href = getAttr(findElement(point.inner, 'content')?.attrs ?? '', 'src')
        if (href && label) {
          const path = resolveHref(ncxItem.path, href)
          if (!titles.has(path)) titles.set(path, label)
        }
      }
    }
  }

  return titles
}

interface ManifestItem {
  id: string
  path: string
  mediaType: string
  properties?: string
  mediaOverlay?: string
}

function findCover(
  files: Unzipped,
  manifest: ManifestItem[],
  opf: string,
): { bytes: Uint8Array; mime: string } | undefined {
  // EPUB 3 marks the cover with properties="cover-image"; EPUB 2 points at it
  // with <meta name="cover" content="<manifest id>">.
  let item = manifest.find((m) => m.properties?.includes('cover-image'))

  if (!item) {
    const meta = findElements(opf, ['meta']).find(
      (m) => getAttr(m.attrs, 'name')?.toLowerCase() === 'cover',
    )
    const id = meta && getAttr(meta.attrs, 'content')
    if (id) item = manifest.find((m) => m.id === id)
  }

  if (!item) return undefined
  const bytes = files[item.path]
  return bytes ? { bytes, mime: item.mediaType || 'image/jpeg' } : undefined
}

export async function readEpub(bytes: Uint8Array, fallbackTitle: string): Promise<ParsedBook> {
  const files = await unzipAll(bytes)

  if (files['META-INF/encryption.xml']) throw new DrmProtectedError()

  const containerXml = readText(files, 'META-INF/container.xml')
  if (!containerXml) throw new Error('Not a valid EPUB: META-INF/container.xml is missing.')

  const rootfile = findElement(containerXml, 'rootfile')
  const opfPath = rootfile && getAttr(rootfile.attrs, 'full-path')
  if (!opfPath) throw new Error('Not a valid EPUB: container.xml names no package document.')

  const opf = readText(files, opfPath)
  if (!opf) throw new Error(`Not a valid EPUB: ${opfPath} is missing.`)

  const manifest: ManifestItem[] = findElements(opf, ['item']).map((item) => ({
    id: getAttr(item.attrs, 'id') ?? '',
    path: resolveHref(opfPath, getAttr(item.attrs, 'href') ?? ''),
    mediaType: getAttr(item.attrs, 'media-type') ?? '',
    properties: getAttr(item.attrs, 'properties'),
    mediaOverlay: getAttr(item.attrs, 'media-overlay'),
  }))

  const byId = new Map(manifest.map((item) => [item.id, item]))
  const tocTitles = readTocTitles(files, manifest)

  const chapters: ParsedChapter[] = []
  const overlays: OverlayAssets[] = []

  for (const ref of findElements(opf, ['itemref'])) {
    const item = byId.get(getAttr(ref.attrs, 'idref') ?? '')
    if (!item) continue

    const source = readText(files, item.path)
    if (!source) continue

    const body = findElement(source, 'body')
    const blocks = extractBlocks(body?.inner ?? source)
    if (blocks.length === 0) continue

    const overlayItem = item.mediaOverlay ? byId.get(item.mediaOverlay) : undefined
    if (overlayItem) {
      const smil = readText(files, overlayItem.path) ?? ''
      const audioRef = findElements(smil, ['audio'])[0]
      const audioSrc = audioRef && getAttr(audioRef.attrs, 'src')
      overlays.push({
        text: item.path,
        smil: overlayItem.path,
        audio: audioSrc ? resolveHref(overlayItem.path, audioSrc) : '',
      })
    }

    const heading = blocks.find((b) => b.type.startsWith('h'))
    chapters.push({
      href: item.path,
      blocks,
      title:
        tocTitles.get(item.path) ??
        heading?.text ??
        item.path.split('/').pop() ??
        `Chapter ${chapters.length + 1}`,
    })
  }

  if (chapters.length === 0) throw new Error('No readable text found in this EPUB.')

  const meta = (name: string) => normalizeText(findElement(opf, name)?.inner ?? '')

  return {
    title: meta('title') || fallbackTitle,
    author: meta('creator') || 'Unknown',
    language: meta('language') || 'en',
    chapters,
    cover: findCover(files, manifest, opf),
    hasMediaOverlays: overlays.length > 0,
    overlays: overlays.length > 0 ? overlays : undefined,
  }
}
