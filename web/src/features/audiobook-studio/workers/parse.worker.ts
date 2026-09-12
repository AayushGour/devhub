// Parsing worker: any supported file in, one normalised book out.
//
// Unzipping an EPUB and walking forty chapters of markup is seconds of work on
// a large book, so none of it runs on the main thread. Nothing here touches a
// DOM — see utils/markup.ts for why that matters in a worker.

import { readEpub, type ParsedBook } from '../utils/epubRead'
import { asBook, readDocx, readMarkdown, readPlainText } from '../utils/textRead'
import type { SourceType } from '../types'

export interface ParseRequest {
  bookId: string
  fileName: string
  bytes: Uint8Array
}

export type ParseResponse =
  | { type: 'status'; bookId: string; label: string }
  | { type: 'parsed'; bookId: string; sourceType: SourceType; book: ParsedBook }
  | { type: 'error'; bookId: string; message: string }

const post = (message: ParseResponse) => (self as unknown as Worker).postMessage(message)

export function sourceTypeFor(fileName: string): SourceType | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'epub': return 'epub'
    case 'pdf': return 'pdf'
    case 'txt': return 'txt'
    case 'md':
    case 'markdown': return 'md'
    case 'docx': return 'docx'
    default: return null
  }
}

/**
 * A readable title from a filename, for formats that carry no metadata.
 * `the-salt-roads.md` -> `The Salt Roads`.
 */
function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

async function parse(request: ParseRequest): Promise<void> {
  const { bookId, fileName, bytes } = request
  const sourceType = sourceTypeFor(fileName)
  if (!sourceType) {
    throw new Error(`Unsupported file type: ${fileName}. Try EPUB, PDF, DOCX, TXT or MD.`)
  }

  const title = titleFromFileName(fileName)
  post({ type: 'status', bookId, label: `reading ${sourceType.toUpperCase()}…` })

  if (sourceType === 'epub') {
    const book = await readEpub(bytes, title)
    post({
      type: 'parsed',
      bookId,
      // A book that already carries Media Overlays needs no narration at all.
      sourceType: book.hasMediaOverlays ? 'epub3-narrated' : 'epub',
      book,
    })
    return
  }

  if (sourceType === 'pdf') {
    throw new Error('PDF support is not built yet.')
  }

  const text = () => new TextDecoder().decode(bytes)

  const chapters =
    sourceType === 'docx'
      ? await readDocx(bytes, title)
      : sourceType === 'md'
        ? await readMarkdown(text(), title)
        : readPlainText(text(), title)

  post({ type: 'parsed', bookId, sourceType, book: asBook(chapters, title) })
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  try {
    await parse(event.data)
  } catch (err) {
    post({
      type: 'error',
      bookId: event.data.bookId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
