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
import { usePlaybackEngine } from './hooks/usePlaybackEngine'
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
  const [boot] = useState(() =>
    Promise.all([
      useAudiobookStore.getState().refreshBooks(),
      useAudiobookStore.getState().loadSettings(),
    ]).then(() => resumeInterrupted()),
  )

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

function StudioInner({ boot }: { boot: Promise<void> }) {
  use(boot)

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
  const [outline, setOutline] = useState<ChapterOutline[]>([])
  const [chapterIndex, setChapterIndex] = useState(0)
  const [chapter, setChapter] = useState<ReadableChapter | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [rate, setRate] = useState(settings.playbackRate)

  const lastSavedRef = useRef(0)


  const playback = usePlaybackEngine({
    mode: book?.mode ?? 'narrated',
    chapter,
    audioUrl,
    rate,
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

  // A chapter that finishes narrating while it is on screen has no audio URL
  // yet; pick it up when the book record updates.
  useEffect(() => {
    if (audioUrl || !book || book.mode === 'live') return
    void loadChapterAudio(book, chapterIndex).then((url) => {
      if (url) setAudioUrl(url)
    })
  }, [audioUrl, book, book?.status, chapterIndex])

  // Persist the reading position, debounced while playing and once on the way
  // out so closing the tab mid-sentence still resumes correctly.
  useEffect(() => {
    if (!book || !state.activeSentenceId) return

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
  }, [book, chapterIndex, state.activeSentenceId, state.currentTime])

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
