// Audiobook Studio.
//
// Convert a book to an EPUB 3 with Media Overlays and read it with the text
// highlighting in step with the narration — all on this device.
//
// Layout is master-detail: a collapsible rail of books beside the reading
// column. The rail collapses itself when playback starts so it stops competing
// with the prose for width, unless the reader has taken manual control of it.

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react'
import { BookAudio } from 'lucide-react'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'
import { createLogger } from '@/lib/logger'
import BookRail from './components/BookRail'
import ConversionPanel from './components/ConversionPanel'
import ModelOverlay from './components/ModelOverlay'
import Reader from './components/Reader'
import TransportBar from './components/TransportBar'
import UploadDialog from './components/UploadDialog'
import { usePlaybackEngine, type StoredPosition } from './hooks/usePlaybackEngine'
import { useAudiobookStore, useActiveBook, useJob } from './store/audiobookStore'
import {
  clearBookCache,
  loadChapter,
  loadChapterAudio,
  loadOutline,
  type ChapterOutline,
  type ReadableChapter,
} from './utils/bookSource'
import { importFile, resumeInterrupted } from './utils/conversionEngine'
import * as db from './utils/db'
import type { BookMode, BookRecord } from './types'

const log = createLogger('audiobook:page')

/** Position is written at most this often while playing. */
const PROGRESS_SAVE_MS = 2000

export default function AudiobookStudioPage() {
  // Created here, in the non-suspending half, so the promise survives the
  // inner component's suspension rather than being recreated on every retry.
  const [boot] = useState(() => openLibrary())

  return (
    <Suspense
      fallback={
        <div className="studio-root items-center justify-center">
          <p className="text-sm text-on-surface-muted">Opening your library…</p>
        </div>
      }
    >
      <StudioInner boot={boot} />
    </Suspense>
  )
}

/**
 * Load the library and reopen whatever was last being read.
 *
 * Done before the first render rather than in an effect so the reader appears
 * already on the right chapter, at the right sentence — returning to a book
 * should not look like opening it for the first time.
 */
async function openLibrary(): Promise<BootState> {
  const state = useAudiobookStore.getState()
  await Promise.all([state.refreshBooks(), state.loadSettings()])
  void resumeInterrupted()

  const recent = useAudiobookStore.getState().books[0]
  if (!recent) return null

  useAudiobookStore.getState().setActiveBook(recent.id)

  const [outline, progress] = await Promise.all([
    loadOutline(recent),
    db.getProgress(recent.id),
  ])
  const index = progress?.chapterIndex ?? 0

  const [chapter, audioUrl] = await Promise.all([
    loadChapter(recent, index),
    loadChapterAudio(recent, index),
  ])

  return {
    bookId: recent.id,
    outline,
    index,
    chapter,
    audioUrl,
    position: progress
      ? { sentenceId: progress.sentenceId, audioTime: progress.audioTime }
      : null,
  }
}

type BootState = {
  bookId: string
  outline: ChapterOutline[]
  index: number
  chapter: ReadableChapter | null
  audioUrl: string | null
  position: StoredPosition | null
} | null

function StudioInner({ boot }: { boot: Promise<BootState> }) {
  const initial = use(boot)

  const books = useAudiobookStore((s) => s.books)
  const settings = useAudiobookStore((s) => s.settings)
  const saveSettings = useAudiobookStore((s) => s.saveSettings)
  const railCollapsed = useAudiobookStore((s) => s.railCollapsed)
  const toggleRail = useAudiobookStore((s) => s.toggleRail)
  const autoCollapseRail = useAudiobookStore((s) => s.autoCollapseRail)
  const setActiveBook = useAudiobookStore((s) => s.setActiveBook)

  const book = useActiveBook()
  const job = useJob(book?.id)

  const [showUpload, setShowUpload] = useState(books.length === 0)
  const [outline, setOutline] = useState<ChapterOutline[]>(initial?.outline ?? [])
  const [chapterIndex, setChapterIndex] = useState(initial?.index ?? 0)
  const [chapter, setChapter] = useState<ReadableChapter | null>(initial?.chapter ?? null)
  const [audioUrl, setAudioUrl] = useState<string | null>(initial?.audioUrl ?? null)
  // Which book the loaded chapter and the current playback position belong to.
  // `book` flips the instant the rail is clicked, but the chapter loads
  // asynchronously — writing progress in that gap would file the outgoing
  // book's position under the incoming book's id.
  const [openedBookId, setOpenedBookId] = useState<string | null>(initial?.bookId ?? null)
  const [rate, setRate] = useState(settings.playbackRate)

  const lastSavedRef = useRef(0)


  const playback = usePlaybackEngine({
    mode: book?.mode ?? 'narrated',
    chapter,
    audioUrl,
    rate,
    initialPosition: initial?.position,
    onChapterEnd: () => {
      if (chapterIndex < outline.length - 1) goToChapter(chapterIndex + 1)
    },
  })

  const { state, toggle, seekTo, seekToSentence, restore } = playback

  const handleToggle = useCallback(() => {
    // Collapsing here rather than in an effect keeps it tied to the user's
    // action — and leaves it alone if they have pinned the rail open.
    if (!state.playing) autoCollapseRail()
    toggle()
  }, [autoCollapseRail, state.playing, toggle])

  // Chapter content is loaded by whatever changes the chapter, not by an effect
  // watching the index. That keeps the load and the navigation in one place and
  // avoids a render pass showing the previous chapter's text.
  const openChapter = useCallback(
    async (record: BookRecord, index: number, resumeAt?: string) => {
      const [content, url] = await Promise.all([
        loadChapter(record, index),
        loadChapterAudio(record, index),
      ])
      setChapterIndex(index)
      setChapter(content)
      setAudioUrl(url)
      setOpenedBookId(record.id)

      if (resumeAt && content) {
        const separator = resumeAt.lastIndexOf(':')
        restore(resumeAt.slice(0, separator), Number(resumeAt.slice(separator + 1)) || 0)
      }
    },
    [restore],
  )

  const goToChapter = useCallback(
    (index: number) => {
      if (book) void openChapter(book, index)
    },
    [book, openChapter],
  )

  // Book selection: load its outline and jump to wherever reading stopped.
  const openBook = useCallback(
    async (bookId: string) => {
      const record = await db.getBook(bookId)
      if (!record) return

      const [chapters, progress] = await Promise.all([
        loadOutline(record),
        db.getProgress(bookId),
      ])

      setOutline(chapters)
      await openChapter(
        record,
        progress?.chapterIndex ?? 0,
        progress ? `${progress.sentenceId}:${progress.audioTime}` : undefined,
      )
      log.log(`[${bookId}] opened — ${chapters.length} chapters`)
    },
    [openChapter],
  )

  // Selecting in the rail is a user action; loading follows from it.
  const selectBook = useCallback(
    (bookId: string) => {
      setActiveBook(bookId)
      setShowUpload(false)
      void openBook(bookId)
    },
    [openBook, setActiveBook],
  )

  // A chapter narrated while it is on screen arrives in two pieces: the audio,
  // and the timings that make it a read-along. Both have to be picked up, or
  // the chapter plays as a bare audio file beside text that never highlights.
  const showingCurrentBook = !!book && book.id === openedBookId

  const incomplete =
    showingCurrentBook &&
    book.mode !== 'live' &&
    (!audioUrl || (chapter?.timeline.length ?? 0) === 0)

  useEffect(() => {
    if (!book || !incomplete) return
    let cancelled = false

    void Promise.all([
      loadChapter(book, chapterIndex),
      loadChapterAudio(book, chapterIndex),
    ]).then(([content, url]) => {
      if (cancelled) return
      // Only replace the chapter once it actually gained timings — swapping in
      // another timing-less copy would just restart this cycle.
      if (content && content.timeline.length > 0) setChapter(content)
      if (url) setAudioUrl(url)
    })

    return () => { cancelled = true }
  }, [book, book?.status, book?.updatedAt, chapterIndex, incomplete])

  // Persist the reading position, debounced while playing and once on the way
  // out so closing the tab mid-sentence still resumes correctly.
  useEffect(() => {
    if (!book || book.id !== openedBookId || !state.activeSentenceId) return

    const save = () => {
      void db.putProgress({
        bookId: book.id,
        chapterIndex,
        sentenceId: state.activeSentenceId!,
        audioTime: state.currentTime,
      })
    }

    const now = Date.now()
    if (now - lastSavedRef.current > PROGRESS_SAVE_MS) {
      lastSavedRef.current = now
      save()
    }

    const onHide = () => { if (document.visibilityState === 'hidden') save() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [book, chapterIndex, openedBookId, state.activeSentenceId, state.currentTime])

  const handleImport = useCallback(
    (file: File, mode: BookMode, voiceId: string) => {
      setShowUpload(false)
      void saveSettings({ voiceId })
      void importFile(file, { mode, voiceId, speed: settings.speed }).then((bookId) => {
        clearBookCache(bookId)
        void openBook(bookId)
      })
    },
    [openBook, saveSettings, settings.speed],
  )

  const handleRate = useCallback(
    (next: number) => {
      setRate(next)
      void saveSettings({ playbackRate: next })
    },
    [saveSettings],
  )

  const chapterReady = Boolean(chapter) && (book?.mode === 'live' || Boolean(audioUrl))

  return (
    <div className="studio-root">
      <ModelOverlay />

      <div className="flex flex-1 min-h-0">
        <CollapsiblePanel
          collapsed={railCollapsed}
          onToggle={toggleRail}
          width="15rem"
          labelExpand="Show library"
          labelCollapse="Hide library"
        >
          <BookRail onAdd={() => setShowUpload(true)} onSelect={selectBook} />
        </CollapsiblePanel>

        <div className="flex-1 min-w-0 flex flex-col">
          {showUpload || !book ? (
            <UploadDialog
              defaultVoiceId={settings.voiceId}
              speed={settings.speed}
              onCancel={() => setShowUpload(false)}
              onImport={handleImport}
            />
          ) : (
            <>
              <ConversionPanel book={book} job={job} speed={settings.speed} />

              {outline.length > 1 && (
                <div className="shrink-0 flex items-center gap-2 px-6 py-2 border-b border-border overflow-x-auto">
                  {outline.map((entry) => (
                    <button
                      key={entry.index}
                      type="button"
                      onClick={() => goToChapter(entry.index)}
                      title={entry.narrated ? entry.title : `${entry.title} — not narrated yet`}
                      className={
                        entry.index === chapterIndex
                          ? 'px-2.5 py-1 text-xs rounded-lg border border-accent text-accent whitespace-nowrap'
                          : entry.narrated
                            ? 'px-2.5 py-1 text-xs rounded-lg border border-border text-on-surface-muted hover:bg-surface-hover whitespace-nowrap transition-colors duration-150'
                            : 'px-2.5 py-1 text-xs rounded-lg border border-dashed border-border text-on-surface-muted/60 whitespace-nowrap'
                      }
                    >
                      {entry.index + 1}. {entry.title}
                    </button>
                  ))}
                </div>
              )}

              {chapter ? (
                <Reader
                  chapter={chapter}
                  activeSentenceId={state.activeSentenceId}
                  wordRange={state.wordRange}
                  autoFollow={settings.autoFollow}
                  fontSizeRem={settings.fontSizeRem}
                  onSeekToSentence={seekToSentence}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 text-on-surface-muted">
                  <BookAudio size={16} />
                  <p className="text-sm">
                    {book.status === 'parsing' ? 'Reading the file…' : 'Nothing to show yet.'}
                  </p>
                </div>
              )}

              <TransportBar
                state={state}
                rate={rate}
                chapterTitle={chapter?.title ?? ''}
                chapterIndex={chapterIndex}
                chapterCount={Math.max(outline.length, 1)}
                ready={chapterReady}
                onToggle={handleToggle}
                onSeek={seekTo}
                onRate={handleRate}
                onChapter={goToChapter}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
