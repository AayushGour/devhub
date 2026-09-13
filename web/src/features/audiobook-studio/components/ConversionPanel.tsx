import { useRef, useState } from 'react'
import { Download, Loader2, Mic, Play, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  cancelNarration,
  reprocess,
  startNarration,
  upgradeToNarrated,
} from '../utils/conversionEngine'
import { loadArtifactBlob } from '../utils/bookSource'
import type { BookRecord, JobRecord } from '../types'

interface Props {
  book: BookRecord
  job: JobRecord | undefined
  speed: number
  /** Voice to narrate with when a live book is upgraded. */
  voiceId: string
}

const BUTTON =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * A sealed book can lose its file without losing its row: the upload dialog
 * warns that an origin without persistent storage may be evicted under disk
 * pressure, and eviction takes the artifact while the library listing stays.
 * The book still looks exportable, so the failure has to be said out loud —
 * a button that does nothing at all reads as a broken app.
 */
const MISSING_ARTIFACT =
  'This book’s file is no longer stored — the browser evicted it. Re-extract the book to rebuild it.'

async function download(book: BookRecord): Promise<void> {
  const blob = await loadArtifactBlob(book.id)
  if (!blob) throw new Error(MISSING_ARTIFACT)

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  // Collapse the whitespace left behind by stripped punctuation, or a title
  // like "Salt & Stone" exports as "Salt  Stone.epub".
  const safeTitle = book.title
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  link.download = `${safeTitle || 'book'}.epub`
  link.click()
  // Revoking in the same tick can cancel the download before the browser has
  // read the blob. Let the click settle first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function ConversionPanel({ book, job, speed, voiceId }: Props) {
  const converting = book.status === 'narrating' || book.status === 'sealing'

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const filePicker = useRef<HTMLInputElement | null>(null)

  /**
   * Read the book again. A narrated book then narrates itself again — that is
   * part of re-extracting, and starting it here as well would queue the work
   * twice and hold this button spinning for the whole conversion, when the
   * progress bar beside it already reports that.
   *
   * Books imported before the source was kept have nothing to re-read, so the
   * reader is asked for the file rather than being told no.
   */
  const reExtract = async (replacement?: File) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await reprocess(book.id, replacement)
      if (!result.ok) {
        setNotice(result.reason ?? 'Could not read that book again.')
        if (result.reason?.includes('Choose it again')) filePicker.current?.click()
      }
    } finally {
      setBusy(false)
    }
  }

  const exportBook = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await download(book)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not export this book.')
    } finally {
      setBusy(false)
    }
  }

  const progress =
    job && job.chapterCount > 0
      ? (job.chapterCursor + (job.sentenceCount ? job.sentenceCursor / job.sentenceCount : 0)) /
        job.chapterCount
      : 0

  return (
    <div className="shrink-0 border-b border-border px-6 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-on-surface truncate">{book.title}</p>
        <p className="text-[0.65rem] text-on-surface-muted truncate">
          {book.author}
          {book.ocrUsed && ' · scanned source, OCR quality varies'}
          {book.status === 'error' && book.error && ` · ${book.error}`}
        </p>
      </div>

      {converting && (
        <div className="flex items-center gap-2 shrink-0 w-[14rem]">
          <Loader2 size={13} className="text-on-surface-muted animate-spin shrink-0" />
          <div className="flex-1 h-1 bg-surface-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-[0.65rem] text-on-surface-muted tabular-nums shrink-0">
            {book.status === 'sealing'
              ? 'sealing'
              : job
                ? `${job.chapterCursor}/${job.chapterCount}`
                : ''}
          </span>
        </div>
      )}

      {notice && (
        <p className="text-[0.65rem] text-amber-400 max-w-[18rem] leading-snug shrink-0">
          {notice}
        </p>
      )}

      <input
        ref={filePicker}
        type="file"
        accept=".epub,.pdf,.txt,.md,.markdown,.docx"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) void reExtract(picked)
        }}
      />

      {!converting && book.status !== 'parsing' && (
        <button
          type="button"
          disabled={busy}
          title="Read the book again from its original file, and narrate it again"
          onClick={() => void reExtract()}
          className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
        >
          <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} />
          Re-extract
        </button>
      )}

      {converting && (
        <button
          type="button"
          onClick={() => cancelNarration(book.id)}
          className={cn(BUTTON, 'border-border text-on-surface-muted hover:bg-surface-hover')}
        >
          <X size={12} />
          Stop
        </button>
      )}

      {(book.status === 'ready-to-narrate' || book.status === 'error') &&
        book.mode === 'narrated' && (
          <button
            type="button"
            onClick={() => void startNarration(book.id, book.voiceId, speed)}
            className={cn(BUTTON, 'border-accent text-accent hover:bg-accent hover:text-accent-text')}
          >
            <Play size={12} />
            {book.status === 'error' ? 'Retry' : 'Narrate'}
          </button>
        )}

      {book.mode === 'live' && !converting && (
        <button
          type="button"
          title="Generate real audio for this book so it can be exported"
          onClick={() => void upgradeToNarrated(book.id, voiceId, speed)}
          className={cn(BUTTON, 'border-accent text-accent hover:bg-accent hover:text-accent-text')}
        >
          <Mic size={12} />
          Narrate it
        </button>
      )}

      {book.status === 'ready' && book.mode === 'narrated' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportBook()}
          className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
        >
          <Download size={12} />
          Export
        </button>
      )}
    </div>
  )
}
