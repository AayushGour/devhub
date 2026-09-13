// EPUB 2 / EPUB 3 reader.
//
// Recovers the publication's metadata, spine order, chapter text and cover,
// and reports whether the book already carries Media Overlays — in which case
// it needs no narration at all and is registered as ready to read.

import { unzip, strFromU8, type Unzipped } from 'fflate'
import {
  findChildElements,
  findElement,
  findElements,
  getAttr,
  normalizeText,
  textContent,
} from './markup'
import type { NavNode } from './navTree'
import { extractBlocksWithAnchors } from './htmlBlocks'
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
  /** The table of contents' own nesting, for navigation. */
  nav?: NavNode[]
}

/**
 * Document semantics that are navigation or apparatus rather than prose.
 *
 * Reading a table of contents or an index aloud is useless, and a copyright
 * page is not part of the book. Matter a listener plausibly wants — dedication,
 * epigraph, foreword, preface, introduction, prologue, epilogue, afterword,
 * acknowledgments, appendix — is deliberately NOT here.
 *
 * Terms from the EPUB 3 Structural Semantics Vocabulary.
 * https://www.w3.org/TR/epub-ssv/
 */
const NON_NARRATIVE_TYPES = new Set([
  'toc', 'landmarks', 'page-list', 'pagelist',
  'cover', 'titlepage', 'halftitlepage', 'copyright-page',
  'index', 'bibliography', 'glossary', 'colophon',
  'loa', 'loi', 'lot', 'lov',
])

/** The document-level semantic of a content document, if it declares one. */
function documentType(source: string): string | undefined {
  const body = findElement(source, 'body')
  const declared =
    (body && getAttr(body.attrs, 'epub:type')) ??
    // Some producers put it on the outermost section instead of the body.
    getAttr(findElement(body?.inner ?? source, 'section')?.attrs ?? '', 'epub:type')

  return declared?.toLowerCase().trim().split(/\s+/)[0]
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

/**
 * A readable name for a spine document that the table of contents skips and
 * that carries no heading of its own — front and back matter, mostly.
 * `01_Epigraph.xhtml` -> `Epigraph`, `29_Backmatter01.xhtml` -> `Backmatter`.
 */
export function titleFromHref(href: string): string {
  const base = (href.split('/').pop() ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/^[\d._-]+/, '')
    .replace(/[\d]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

  return base ? base.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : ''
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
      // A nav document holds several navs. Only the one marked `toc` is the
      // table of contents; the others are landmarks and a page-list whose links
      // carry page numbers ("ii", "12") and point at the same documents. Read
      // the whole file and those overwrite every real chapter title.
      const navs = findElements(source, ['nav'])
      const toc = navs.find((nav) => getAttr(nav.attrs, 'epub:type')?.includes('toc'))
      const scope = toc?.inner ?? (navs.length === 0 ? source : undefined)

      if (scope !== undefined) {
        for (const anchor of findElements(scope, ['a'])) {
          const href = getAttr(anchor.attrs, 'href')
          const label = textContent(anchor.inner)
          // First reference wins: a document's title is its first appearance,
          // not a later link that happens to point at it again.
          const path = href ? resolveHref(navItem.path, href) : null
          if (path && label && !titles.has(path)) titles.set(path, label)
        }
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

interface TocTarget {
  /** Archive path of the document the entry points at. */
  path: string
  /** Fragment within it, when the entry targets part of a document. */
  fragment?: string
  title: string
}

/**
 * Every contents entry, flattened but in document order.
 *
 * Read before the chapters are built, because the fragments decide where one
 * content document has to be cut into several.
 */
function readTocTargets(navSource: string, navPath: string): TocTarget[] {
  const navs = findElements(navSource, ['nav'])
  const toc = navs.find((nav) => getAttr(nav.attrs, 'epub:type')?.includes('toc'))
  const scope = toc?.inner ?? (navs.length === 0 ? navSource : undefined)
  if (scope === undefined) return []

  const targets: TocTarget[] = []
  for (const anchor of findElements(scope, ['a'])) {
    const href = getAttr(anchor.attrs, 'href')
    const title = textContent(anchor.inner)
    if (!href || !title) continue
    const [, fragment] = href.split('#')
    targets.push({ path: resolveHref(navPath, href), fragment, title })
  }
  return targets
}

/**
 * Rebuild the table of contents' nesting as a tree of chapter references.
 *
 * Entries are matched to spine documents by path, so an entry pointing at a
 * document that is not in the spine — or at a fragment of one already claimed —
 * becomes a branch with no chapter of its own rather than a broken leaf.
 */
function buildNavTree(
  navSource: string,
  navPath: string,
  indexByTarget: Map<string, number>,
): NavNode[] {
  const navs = findElements(navSource, ['nav'])
  const toc = navs.find((nav) => getAttr(nav.attrs, 'epub:type')?.includes('toc'))
  const scope = toc?.inner ?? (navs.length === 0 ? navSource : undefined)
  if (scope === undefined) return []

  const claimed = new Set<number>()
  let counter = 0

  const readList = (listInner: string): NavNode[] => {
    const nodes: NavNode[] = []

    for (const item of findChildElements(listInner, ['li'])) {
      const anchor = findChildElements(item.inner, ['a', 'span'])[0]
      const title = anchor ? textContent(anchor.inner) : ''
      const href = anchor ? getAttr(anchor.attrs, 'href') : undefined

      const nestedList = findChildElements(item.inner, ['ol', 'ul'])[0]
      const children = nestedList ? readList(nestedList.inner) : []

      // Resolved by fragment first: several entries pointing into one document
      // are several chapters, and matching on path alone collapses them.
      const path = href ? resolveHref(navPath, href) : undefined
      const fragment = href?.split('#')[1]
      const index =
        path === undefined
          ? undefined
          : (fragment !== undefined ? indexByTarget.get(`${path}#${fragment}`) : undefined) ??
            indexByTarget.get(path)

      const owns = index !== undefined && !claimed.has(index)
      if (owns) claimed.add(index)

      if (!title && children.length === 0) continue

      nodes.push({
        id: `n${counter++}`,
        title: title || `Section ${nodes.length + 1}`,
        chapterIndex: owns ? index : undefined,
        children,
      })
    }

    return nodes
  }

  const rootList = findChildElements(scope, ['ol', 'ul'])[0]
  return rootList ? readList(rootList.inner) : []
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

  const navItem = manifest.find((item) => item.properties?.includes('nav'))
  const navSource = navItem ? readText(files, navItem.path) : null
  const tocTargets = navSource && navItem ? readTocTargets(navSource, navItem.path) : []

  // Fragments the contents points at, per document, in contents order. These
  // are the cut lines for a file that holds more than one chapter.
  const fragmentsByPath = new Map<string, TocTarget[]>()
  for (const target of tocTargets) {
    if (!target.fragment) continue
    const list = fragmentsByPath.get(target.path)
    if (list) list.push(target)
    else fragmentsByPath.set(target.path, [target])
  }

  const chapters: ParsedChapter[] = []
  const overlays: OverlayAssets[] = []
  /** `path` and `path#fragment` -> chapter index, for wiring the tree later. */
  const indexByTarget = new Map<string, number>()

  for (const ref of findElements(opf, ['itemref'])) {
    // Auxiliary content: "a reading system might... omit [it] from an aural
    // rendering". Answer keys, note collections and the like.
    // https://www.w3.org/TR/epub-33/#attrdef-itemref-linear
    if (getAttr(ref.attrs, 'linear') === 'no') continue

    const item = byId.get(getAttr(ref.attrs, 'idref') ?? '')
    if (!item) continue

    const source = readText(files, item.path)
    if (!source) continue

    const semantic = documentType(source)
    if (semantic && NON_NARRATIVE_TYPES.has(semantic)) continue

    const body = findElement(source, 'body')
    const markup = body?.inner ?? source

    const targets = fragmentsByPath.get(item.path) ?? []
    const { blocks, anchorAt } = extractBlocksWithAnchors(
      markup,
      new Set(targets.map((target) => target.fragment!)),
    )
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

    // Cut points found in the document, in the order they appear in it. A
    // contents entry whose anchor is missing simply contributes no cut.
    const cuts = targets
      .map((target) => ({ target, at: anchorAt.get(target.fragment!) }))
      .filter((cut): cut is { target: TocTarget; at: number } => cut.at !== undefined)
      .sort((a, b) => a.at - b.at)

    const emit = (from: number, to: number, title: string, fragment?: string) => {
      const slice = blocks.slice(from, to)
      if (slice.length === 0) return
      indexByTarget.set(fragment ? `${item.path}#${fragment}` : item.path, chapters.length)
      // The first piece also answers to the bare path, for entries that point
      // at the document rather than into it.
      if (!indexByTarget.has(item.path)) indexByTarget.set(item.path, chapters.length)
      chapters.push({ href: item.path, blocks: slice, title })
    }

    const headingOf = (from: number, to: number) =>
      blocks.slice(from, to).find((b) => b.type.startsWith('h'))?.text

    const firstCut = cuts[0]?.at ?? blocks.length

    // Anything before the first cut keeps the document's own title.
    emit(
      0,
      firstCut,
      tocTitles.get(item.path) ||
        headingOf(0, firstCut) ||
        titleFromHref(item.path) ||
        `Chapter ${chapters.length + 1}`,
    )

    cuts.forEach((cut, i) => {
      const end = cuts[i + 1]?.at ?? blocks.length
      emit(
        cut.at,
        end,
        cut.target.title || headingOf(cut.at, end) || `Chapter ${chapters.length + 1}`,
        cut.target.fragment,
      )
    })
  }

  if (chapters.length === 0) throw new Error('No readable text found in this EPUB.')

  const meta = (name: string) => normalizeText(findElement(opf, name)?.inner ?? '')

  const nav =
    navSource && navItem ? buildNavTree(navSource, navItem.path, indexByTarget) : []

  return {
    title: meta('title') || fallbackTitle,
    author: meta('creator') || 'Unknown',
    language: meta('language') || 'en',
    chapters,
    cover: findCover(files, manifest, opf),
    hasMediaOverlays: overlays.length > 0,
    overlays: overlays.length > 0 ? overlays : undefined,
    nav: nav.length > 0 ? nav : undefined,
  }
}
