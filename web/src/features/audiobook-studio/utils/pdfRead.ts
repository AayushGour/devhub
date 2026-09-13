// PDF input.
//
// Pulls positioned glyph runs out of the document and hands them to the
// geometry heuristics in pdfStructure.ts. Pages with no text layer are scanned
// images; those are rendered and read with OCR, which is slow and imperfect, so
// it is attempted only for the pages that need it.

import * as pdfjs from 'pdfjs-dist'
// `?url` hands back the asset URL without letting Vite transform the module —
// which is what broke pdf.js's own worker bundle when this was an ordinary
// import. The worker ships in dist, so a PDF no longer depends on a CDN being
// reachable, or on it having published the exact pdfjs-dist version we build
// against.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createLogger } from '@/lib/logger'
import { buildChapters, type PdfOutlineEntry, type PdfPage, type PdfTextItem } from './pdfStructure'
import { treeFromDepths } from './navTree'
import type { ParsedBook, ParsedChapter } from './epubRead'

const log = createLogger('audiobook:pdf')

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Below this, a page is assumed to be a scan rather than real text. */
const MIN_CHARS_FOR_TEXT_LAYER = 20

/**
 * How deep the outline is followed. Three levels covers Part > Chapter >
 * Section; beyond that the entries are usually finer than a listener navigates.
 */
const MAX_OUTLINE_DEPTH = 3

/** OCR renders at this scale — below ~2x, recognition quality falls off badly. */
const OCR_SCALE = 2

export interface PdfProgress {
  (stage: string, done: number, total: number): void
}

interface RawTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  fontName?: string
}

/**
 * Weight and slope, read from the font's name.
 *
 * pdf.js exposes `bold` and `italic` on the font object, but only for fonts it
 * had to substitute — an embedded Arial-BoldMT reports neither. The name is
 * what actually carries the information.
 */
function styleOf(name: string | undefined): { bold: boolean; italic: boolean } {
  const clean = (name ?? '').replace(/^[A-Z]{6}\+/, '')
  return {
    bold: /bold|black|heavy|semibold|demibold|[-_]bd\b/i.test(clean),
    italic: /italic|oblique|[-_]it\b/i.test(clean),
  }
}

/**
 * Real font names, keyed by the id `getTextContent` reports.
 *
 * Text content only carries an internal id such as `g_d0_f1`; the descriptor
 * lives in `commonObjs`, and that is not populated until the page's operator
 * list has been built. Without this step every run looks like the same font.
 */
async function fontNames(page: pdfjs.PDFPageProxy, ids: Iterable<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  try {
    await page.getOperatorList()
  } catch {
    return names
  }
  for (const id of ids) {
    try {
      const font = page.commonObjs.get(id) as { name?: string } | undefined
      if (font?.name) names.set(id, font.name)
    } catch {
      // A font the page never actually drew; nothing to record.
    }
  }
  return names
}

function toItems(content: { items: unknown[] }, names: Map<string, string>): PdfTextItem[] {
  return (content.items as RawTextItem[])
    .filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
    .map((item) => {
      const fontName = names.get(item.fontName ?? '') ?? item.fontName
      const { bold, italic } = styleOf(fontName)
      return {
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        // A zero-height run would break every size comparison downstream.
        height: item.height || Math.abs(item.transform[3]) || 10,
        fontName,
        bold,
        italic,
      }
    })
}

/** Flatten the PDF outline into chapter starts, resolving destinations to pages. */
async function readOutline(
  doc: pdfjs.PDFDocumentProxy,
): Promise<PdfOutlineEntry[]> {
  let outline: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>
  try {
    outline = await doc.getOutline()
  } catch {
    return []
  }
  if (!outline?.length) return []

  const entries: PdfOutlineEntry[] = []

  const walk = async (nodes: typeof outline, depth: number): Promise<void> => {
    for (const node of nodes ?? []) {
      try {
        const dest =
          typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest
        const ref = Array.isArray(dest) ? dest[0] : null
        if (ref) {
          // An /XYZ destination carries [ref, {name}, left, top, zoom]; `top`
          // is what separates two sections sharing a page. /Fit and friends
          // give no coordinate, which means the top of the page.
          const top = Array.isArray(dest) && typeof dest[3] === 'number' ? dest[3] : undefined
          entries.push({
            title: node.title.trim(),
            pageIndex: await doc.getPageIndex(ref),
            y: top,
            depth,
          })
        }
      } catch {
        // A broken destination is common in the wild; skip that entry only.
      }
      // Recurse to the outline's own depth. Stopping at the first level threw
      // away every grandchild entry, so a book labelled Part > Chapter >
      // Section lost its sections outright.
      if (depth < MAX_OUTLINE_DEPTH && node.items?.length) {
        await walk(node.items, depth + 1)
      }
    }
  }

  await walk(outline, 0)
  return entries.filter((entry) => entry.title.length > 0)
}

/**
 * Recognise a rendered page. Returns pseudo text items positioned from the OCR
 * word boxes, so scanned pages re-enter the same geometry pipeline as real text.
 */
type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>

/**
 * One recogniser for the whole document.
 *
 * Starting a Tesseract worker costs a wasm instantiation and a language-data
 * load — seconds each. A scanned book runs to hundreds of pages, so creating
 * one per page spends longer starting workers than reading text.
 */
async function ocrWorkerFor(): Promise<OcrWorker> {
  const { createWorker } = await import('tesseract.js')

  // Vendored into public/ by scripts/vendor-ocr-assets.mjs. BASE_URL carries the
  // deployment prefix (the app is served from a subpath on GitHub Pages), and
  // always ends in a slash. Without these three, tesseract.js reaches for a CDN.
  const base = `${import.meta.env.BASE_URL}tesseract/`
  return createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}tesseract-core-simd.wasm.js`,
    langPath: `${base}lang`,
  })
}

async function ocrPage(
  worker: OcrWorker,
  page: pdfjs.PDFPageProxy,
  pageHeight: number,
): Promise<PdfTextItem[]> {
  const viewport = page.getViewport({ scale: OCR_SCALE })

  const canvas = new OffscreenCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('OffscreenCanvas 2D context unavailable')

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise

  const blob = await canvas.convertToBlob({ type: 'image/png' })

  const { data } = await worker.recognize(blob, {}, { blocks: true })
  const words = (data.blocks ?? [])
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? [])
    .flatMap((line) => line.words ?? [])

  return words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => {
      const { x0, y0, x1, y1 } = word.bbox
      return {
        str: word.text,
        // Canvas coordinates grow downward; PDF user space grows upward.
        x: x0 / OCR_SCALE,
        y: pageHeight - y1 / OCR_SCALE,
        width: (x1 - x0) / OCR_SCALE,
        height: Math.max(1, (y1 - y0) / OCR_SCALE),
        // Recognition returns words, not glyph runs.
        isWord: true,
      }
    })
}

export interface PdfReadResult extends ParsedBook {
  /** True when at least one page had to be recognised rather than read. */
  ocrUsed: boolean
}

export async function readPdf(
  bytes: Uint8Array,
  fallbackTitle: string,
  onProgress: PdfProgress,
): Promise<PdfReadResult> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise

  const pages: PdfPage[] = []
  let ocrPages = 0
  // Started on the first page that needs it, kept for the rest of the document.
  let ocr: OcrWorker | null = null

  for (let index = 0; index < doc.numPages; index++) {
    onProgress('extracting', index + 1, doc.numPages)

    const page = await doc.getPage(index + 1)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    const ids = new Set(
      (content.items as RawTextItem[]).map((item) => item.fontName).filter(Boolean) as string[],
    )
    let items = toItems(content, await fontNames(page, ids))
    const charCount = items.reduce((sum, item) => sum + item.str.length, 0)

    if (charCount < MIN_CHARS_FOR_TEXT_LAYER) {
      onProgress('recognising', index + 1, doc.numPages)
      try {
        ocr ??= await ocrWorkerFor()
        items = await ocrPage(ocr, page, viewport.height)
        if (items.length > 0) ocrPages++
      } catch (err) {
        log.warn(`page ${index + 1}: OCR failed —`, err)
      }
    }

    pages.push({ index, width: viewport.width, height: viewport.height, items })
    page.cleanup()
  }

  await ocr?.terminate()

  const outline = await readOutline(doc)

  const metadata = await doc.getMetadata().catch(() => null)
  const info = (metadata?.info ?? {}) as { Title?: string; Author?: string }

  doc.destroy()

  const built = buildChapters(pages, outline)
  const chapters: ParsedChapter[] = built.map((chapter, i) => ({
    title: chapter.title,
    blocks: chapter.blocks,
    href: `pdf-${i}`,
  }))

  if (chapters.length === 0) {
    throw new Error(
      'No readable text found in this PDF. If it is a scan, the page images could not be recognised.',
    )
  }

  log.log(`parsed ${doc.numPages} pages into ${chapters.length} chapters (${ocrPages} via OCR)`)

  return {
    title: info.Title?.trim() || fallbackTitle,
    author: info.Author?.trim() || 'Unknown',
    language: 'en',
    chapters,
    hasMediaOverlays: false,
    ocrUsed: ocrPages > 0,
    // The outline's nesting, recovered from the depth each chapter came from.
    nav: treeFromDepths(built),
  }
}
