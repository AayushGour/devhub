import { Download, Loader2, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cancelNarration, startNarration } from '../utils/conversionEngine'
import { loadArtifactBlob } from '../utils/bookSource'
import type { BookRecord, JobRecord } from '../types'

interface Props {
  book: BookRecord
  job: JobRecord | undefined
  speed: number
}

const BUTTON =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

async function download(book: BookRecord): Promise<void> {
  const blob = await loadArtifactBlob(book.id)
  if (!blob) return

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${book.title.replace(/[^\w\s-]/g, '').trim() || 'book'}.epub`
  link.click()
  URL.revokeObjectURL(url)
}

export default function ConversionPanel({ book, job, speed }: Props) {
  const converting = book.status === 'narrating' || book.status === 'sealing'

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

      {book.status === 'ready' && book.mode === 'narrated' && (
        <button
          type="button"
          onClick={() => void download(book)}
          className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
        >
          <Download size={12} />
          Export
        </button>
      )}
    </div>
  )
}
