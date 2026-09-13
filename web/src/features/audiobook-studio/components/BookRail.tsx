import { AlertCircle, BookAudio, Loader2, Plus, Radio, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatLength } from '../utils/format'
import { useAudiobookStore } from '../store/audiobookStore'
import type { BookRecord, JobRecord } from '../types'

interface Props {
  onAdd: () => void
  onSelect: (bookId: string) => void
}

/** Fraction of the book converted so far, or null when that is not meaningful. */
function jobProgress(book: BookRecord, job: JobRecord | undefined): number | null {
  if (book.status === 'ready') return 1
  if (!job || job.chapterCount === 0) return null

  const chaptersDone = job.chapterCursor
  const withinChapter =
    job.sentenceCount > 0 ? job.sentenceCursor / job.sentenceCount : 0

  return Math.min(1, (chaptersDone + withinChapter) / job.chapterCount)
}

function ProgressRing({ value }: { value: number }) {
  const radius = 7
  const circumference = 2 * Math.PI * radius

  return (
    <svg viewBox="0 0 18 18" className="w-[1.125rem] h-[1.125rem] shrink-0 -rotate-90">
      <circle cx="9" cy="9" r={radius} fill="none" strokeWidth="2" className="stroke-border" />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-accent"
        // Data-driven geometry — not expressible as a utility class.
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: circumference * (1 - value),
        }}
      />
    </svg>
  )
}

function StatusIcon({ book, job }: { book: BookRecord; job: JobRecord | undefined }) {
  if (book.status === 'error') return <AlertCircle size={14} className="text-red-400 shrink-0" />
  if (book.status === 'parsing') {
    return <Loader2 size={14} className="text-on-surface-muted animate-spin shrink-0" />
  }
  if (book.mode === 'live') return <Radio size={14} className="text-on-surface-muted shrink-0" />

  const progress = jobProgress(book, job)
  if (progress !== null) return <ProgressRing value={progress} />

  return <BookAudio size={14} className="text-on-surface-muted shrink-0" />
}

function statusLine(book: BookRecord, job: JobRecord | undefined): string {
  switch (book.status) {
    case 'parsing':
      return 'reading the file…'
    case 'ready-to-narrate':
      return `${book.chapterCount} chapters · not narrated`
    case 'narrating':
      return job
        ? `narrating ${job.chapterCursor + 1}/${job.chapterCount}`
        : 'narrating…'
    case 'sealing':
      return 'building the EPUB…'
    case 'error':
      return book.error ?? 'conversion failed'
    case 'ready':
      return book.mode === 'live'
        ? `${book.chapterCount} chapters · live`
        : `${book.chapterCount} chapters · ${formatLength(book.durationSec)}`
  }
}

export default function BookRail({ onAdd, onSelect }: Props) {
  const books = useAudiobookStore((s) => s.books)
  const jobs = useAudiobookStore((s) => s.jobs)
  const activeBookId = useAudiobookStore((s) => s.activeBookId)
  const removeBook = useAudiobookStore((s) => s.removeBook)

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border',
            'bg-transparent text-on-surface-muted text-xs cursor-pointer font-[inherit]',
            'transition-colors duration-150 hover:text-on-surface hover:border-on-surface-muted',
          )}
        >
          <Plus size={13} />
          Add a book
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {books.length === 0 && (
          <p className="text-[0.65rem] text-on-surface-muted/70 italic px-1 py-2">
            No books yet.
          </p>
        )}

        {books.map((book) => {
          const isActive = book.id === activeBookId
          return (
            // Two buttons side by side, never one inside the other: a delete
            // nested in a row that was itself role="button" fired both handlers
            // on Enter — the book was removed and then opened.
            <div
              key={book.id}
              className={cn(
                'group relative rounded-lg border transition-colors duration-150',
                isActive
                  ? 'border-accent bg-surface-hover'
                  : 'border-transparent hover:bg-surface-hover',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(book.id)}
                className={cn(
                  'w-full flex items-start gap-2 py-2 pl-2 pr-7 rounded-lg text-left',
                  'cursor-pointer font-[inherit]',
                )}
              >
                <span className="mt-px">
                  <StatusIcon book={book} job={jobs[book.id]} />
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-xs truncate',
                      isActive ? 'text-accent' : 'text-on-surface',
                    )}
                    title={book.title}
                  >
                    {book.title}
                  </span>
                  <span className="block text-[0.65rem] text-on-surface-muted truncate">
                    {statusLine(book, jobs[book.id])}
                  </span>
                </span>
              </button>

              <button
                type="button"
                title={`Remove ${book.title}`}
                onClick={() => void removeBook(book.id)}
                className={cn(
                  'absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100',
                  'text-on-surface-muted hover:text-red-400 transition-colors duration-150',
                )}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
