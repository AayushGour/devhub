// PDF input.
//
// Pulls positioned glyph runs out of the document and hands them to the
// geometry heuristics in pdfStructure.ts. Pages with no text layer are scanned
// images; those are rendered and read with OCR, which is slow and imperfect, so
// it is attempted only for the pages that need it.

import * as pdfjs from 'pdfjs-dist'
import { createLogger } from '@/lib/logger'
import { buildChapters, type PdfOutlineEntry, type PdfPage, type PdfTextItem } from './pdfStructure'
import type { ParsedBook, ParsedChapter } from './epubRead'

const log = createLogger('audiobook:pdf')

// Matches rag-studio's approach: a CDN worker URL, because Vite's `?import`
// transformation breaks pdf.js's own worker bundle.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

/** Below this, a page is assumed to be a scan rather than real text. */
const MIN_CHARS_FOR_TEXT_LAYER = 20

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

function toItems(content: { items: unknown[] }): PdfTextItem[] {
  return (content.items as RawTextItem[])
    .filter((item) => typeof item.str === 'string' && item.str.trim().length > 0)
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      // A zero-height run would break every size comparison downstream.
      height: item.height || Math.abs(item.transform[3]) || 10,
      fontName: item.fontName,
    }))
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
          })
        }
      } catch {
        // A broken destination is common in the wild; skip that entry only.
      }
      // Only top-level entries become chapters — deeper ones are sections.
      if (depth === 0 && node.items?.length) await walk(node.items, depth + 1)
    }
  }

  await walk(outline, 0)
  return entries.filter((entry) => entry.title.length > 0)
}

/**
 * Recognise a rendered page. Returns pseudo text items positioned from the OCR
 * word boxes, so scanned pages re-enter the same geometry pipeline as real text.
 */
async function ocrPage(
  page: pdfjs.PDFPageProxy,
  pageHeight: number,
): Promise<PdfTextItem[]> {
  const { createWorker } = await import('tesseract.js')
  const viewport = page.getViewport({ scale: OCR_SCALE })

  const canvas = new OffscreenCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('OffscreenCanvas 2D context unavailable')

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const worker = await createWorker('eng')

  try {
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
        }
      })
  } finally {
    await worker.terminate()
  }
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

  for (let index = 0; index < doc.numPages; index++) {
    onProgress('extracting', index + 1, doc.numPages)

    const page = await doc.getPage(index + 1)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    let items = toItems(content)
    const charCount = items.reduce((sum, item) => sum + item.str.length, 0)

    if (charCount < MIN_CHARS_FOR_TEXT_LAYER) {
      onProgress('recognising', index + 1, doc.numPages)
      try {
        items = await ocrPage(page, viewport.height)
        if (items.length > 0) ocrPages++
      } catch (err) {
        log.warn(`page ${index + 1}: OCR failed —`, err)
      }
    }

    pages.push({ index, width: viewport.width, height: viewport.height, items })
    page.cleanup()
  }

  const outline = await readOutline(doc)

  const metadata = await doc.getMetadata().catch(() => null)
  const info = (metadata?.info ?? {}) as { Title?: string; Author?: string }

  doc.destroy()

  const chapters: ParsedChapter[] = buildChapters(pages, outline).map((chapter, i) => ({
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
  }
}
