// Sealing worker.
//
// Builds the EPUB 3 package documents and deflates the archive. A narrated book
// runs to hundreds of megabytes, so this never happens on the main thread.
//
// Runs only once per book, on the last chapter. Until it does, the staging rows
// are the only copy of the audio — the engine must store the artifact before
// clearing them.

import { buildEpubFiles, type BookMeta, type ChapterInput } from '../utils/epubWrite'
import { sealEpubBytes } from '../utils/zip'

export interface SealRequest {
  bookId: string
  meta: BookMeta
  chapters: ChapterInput[]
  /** Chapter index -> encoded MP3. */
  audio: [number, Uint8Array][]
  /** ISO timestamp for dcterms:modified, passed in so the worker stays pure. */
  modified: string
}

export type SealResponse =
  | { type: 'sealed'; bookId: string; epub: Uint8Array; bytes: number; sealMs: number }
  | { type: 'error'; bookId: string; message: string }

const post = (message: SealResponse, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(message, transfer ?? [])

self.onmessage = async (event: MessageEvent<SealRequest>) => {
  const { bookId, meta, chapters, audio, modified } = event.data
  try {
    const startedAt = performance.now()
    const files = buildEpubFiles(meta, chapters, new Map(audio), modified)
    const epub = await sealEpubBytes(files)

    post(
      {
        type: 'sealed',
        bookId,
        epub,
        bytes: epub.byteLength,
        sealMs: Math.round(performance.now() - startedAt),
      },
      [epub.buffer],
    )
  } catch (err) {
    post({
      type: 'error',
      bookId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
