// Audiobook Studio.
//
// Convert a book to an EPUB 3 with Media Overlays and read it with the text
// highlighting in step with the narration — all on this device.
//
// Layout is master-detail: a collapsible rail of books beside the reading
// column. The rail collapses itself when playback starts so it stops competing
// with the prose for width, unless the reader has taken manual control of it.

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useAudiobookStore, useJob } from './store/audiobookStore'
import {
  clearBookCache,
  loadChapterAudio,
  loadOutline,
  loadView,
  type ChapterOutline,
  type ReadableChapter,
} from './utils/bookSource'
import ChapterTree from './components/ChapterTree'
import {
  flatTree,
  nextView,
  viewContaining,
  viewForNode,
  viewsAtDepth,
  type NavView,
} from './utils/navTree'
import { importFile, resumeInterrupted } from './utils/conversionEngine'
import * as db from './utils/db'
import type { BookMode, BookRecord } from './types'

const log = createLogger('audiobook:page')

/** Position is written at most this often while playing. */
const PROGRESS_SAVE_MS = 2000

export default function AudiobookStudioPage() {
  // Created here, in the non-suspending half, so the promise survives the
  // inner component's suspension rather than being recreated on every retry.
  const [boot] = useState(bootLibrary)

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
 * One library open per mount, however many times React asks for it.
 *
 * A `useState` initialiser is double-invoked under StrictMode, and this one has
 * side effects: it picks the active book and queues every interrupted
 * conversion. Called twice, every interrupted book is queued twice. The promise
 * is dropped again once it settles, so coming back to the page later still
 * opens the library fresh rather than replaying a stale snapshot of it.
 */
let opening: Promise<BootState> | null = null

function bootLibrary(): Promise<BootState> {
  if (!opening) {
    const inFlight = openLibrary()
    opening = inFlight
    const settle = () => { if (opening === inFlight) opening = null }
    // Both arms, so a failed boot clears the slot and is not re-thrown here —
    // the `use()` in StudioInner is what reports it.
    inFlight.then(settle, settle)
  }
  return opening
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

  const tree = recent.nav ?? flatTree(outline.map((entry) => entry.title))
  // Reopen at the page that holds the chapter last read, at the finest level,
  // so returning to a book lands exactly where it was left.
  const view =
    viewContaining(tree, Number.MAX_SAFE_INTEGER, index) ?? viewsAtDepth(tree, 0)[0]

  const [pages, audio] = await Promise.all([
    view ? loadView(recent, view.leaves) : Promise.resolve([]),
    loadChapterAudio(recent, index),
  ])

  return {
    bookId: recent.id,
    outline,
    view: view ?? null,
    index,
    pages,
    audio,
    position: progress
      ? { chapterIndex: index, sentenceId: progress.sentenceId, audioTime: progress.audioTime }
      : null,
  }
}

type BootState = {
  bookId: string
  outline: ChapterOutline[]
  view: NavView | null
  index: number
  pages: ReadableChapter[]
  audio: Blob | null
  position: StoredPosition | null
} | null

function StudioInner({ boot }: { boot: Promise<BootState> }) {
  const initial = use(boot)

  const settings = useAudiobookStore((s) => s.settings)
  const saveSettings = useAudiobookStore((s) => s.saveSettings)
  const railCollapsed = useAudiobookStore((s) => s.railCollapsed)
  const toggleRail = useAudiobookStore((s) => s.toggleRail)
  const autoCollapseRail = useAudiobookStore((s) => s.autoCollapseRail)
  const setActiveBook = useAudiobookStore((s) => s.setActiveBook)

  const books = useAudiobookStore((s) => s.books)

  const [showUpload, setShowUpload] = useState(books.length === 0)
  const [outline, setOutline] = useState<ChapterOutline[]>(initial?.outline ?? [])
  /** The page on screen: one chapter, or a whole section's worth. */
  const [view, setView] = useState<NavView | null>(initial?.view ?? null)
  const [pages, setPages] = useState<ReadableChapter[]>(initial?.pages ?? [])
  /** Which chapter within the page is being spoken. */
  const [chapterIndex, setChapterIndex] = useState(initial?.index ?? 0)
  const [audio, setAudio] = useState<Blob | null>(initial?.audio ?? null)
  /**
   * The book whose chapter is actually loaded.
   *
   * The rail highlights a click immediately, but content loads asynchronously.
   * Everything in the reading pane is derived from this rather than from the
   * selection, so a title, its chapter tabs and its prose always describe the
   * same book — and so a position is never written under the wrong book's id.
   */
  const [openedBookId, setOpenedBookId] = useState<string | null>(initial?.bookId ?? null)
  const [rate, setRate] = useState(settings.playbackRate)

  const book = useMemo(
    () => books.find((b) => b.id === openedBookId),
    [books, openedBookId],
  )
  const job = useJob(book?.id)

  const lastSavedRef = useRef(0)


  const tree = useMemo(
    () => book?.nav ?? flatTree(outline.map((entry) => entry.title)),
    [book, outline],
  )

  const activeChapter = useMemo(
    () => pages.find((page) => page.index === chapterIndex) ?? null,
    [pages, chapterIndex],
  )

  /**
   * Where playback goes after the chapter that just ended.
   *
   * Within a page it is simply the next chapter on it. At the end of a page it
   * is the next page at the SAME depth — sibling sections included — which is
   * what carries the reader from the last chapter of one section into the first
   * of the next without skipping anything between them.
   */
  const advanceRef = useRef<() => void>(() => {})

  const playback = usePlaybackEngine({
    mode: book?.mode ?? 'narrated',
    chapter: activeChapter,
    audio,
    rate,
    initialPosition: initial?.position,
    onChapterEnd: () => advanceRef.current(),
  })

  const { state, toggle, seekTo, seekToSentence, restore } = playback

  const handleToggle = useCallback(() => {
    // Collapsing here rather than in an effect keeps it tied to the user's
    // action — and leaves it alone if they have pinned the rail open.
    if (!state.playing) autoCollapseRail()
    toggle()
  }, [autoCollapseRail, state.playing, toggle])

  /**
   * Open a page.
   *
   * Content is loaded by whatever changes the page, not by an effect watching
   * state, so the load and the navigation stay in one place and no render shows
   * the previous book's text under this book's title.
   */
  const openView = useCallback(
    async (
      record: BookRecord,
      nextView: NavView,
      startAt?: number,
      resumeAt?: StoredPosition,
      nextOutline?: ChapterOutline[],
    ) => {
      const first = startAt ?? nextView.leaves[0]
      const [content, clip] = await Promise.all([
        loadView(record, nextView.leaves),
        loadChapterAudio(record, first),
      ])

      // Everything describing the book lands together.
      if (nextOutline) setOutline(nextOutline)
      setView(nextView)
      setPages(content)
      setChapterIndex(first)
      setAudio(clip)
      setOpenedBookId(record.id)

      // The engine still holds the book being left at this point; the position
      // names its chapter, so it waits for the element built for that chapter
      // rather than landing on this one.
      if (resumeAt && content.length > 0) restore(resumeAt)
    },
    [restore],
  )

  /** Move to another chapter already on this page — no reload needed. */
  const goToChapterOnPage = useCallback(
    async (record: BookRecord, index: number) => {
      const clip = await loadChapterAudio(record, index)
      setChapterIndex(index)
      setAudio(clip)
    },
    [],
  )

  /**
   * Play from a sentence the reader clicked.
   *
   * A branch selection puts a whole section on one page, and sentence ids
   * restart at s1 in every chapter on it, so the click names its own chapter.
   * When that is not the chapter in the engine, its audio has to be swapped in
   * first — the engine holds the request until the element for it exists.
   */
  const handleSeekToSentence = useCallback(
    (targetIndex: number, sentenceId: string) => {
      seekToSentence(targetIndex, sentenceId)
      if (book && targetIndex !== chapterIndex) void goToChapterOnPage(book, targetIndex)
    },
    [book, chapterIndex, goToChapterOnPage, seekToSentence],
  )

  const selectNode = useCallback(
    (nodeId: string) => {
      if (!book) return
      const next = viewForNode(tree, nodeId)
      if (next) void openView(book, next)
    },
    [book, openView, tree],
  )

  const advance = useCallback(() => {
    if (!book || !view) return

    // Still chapters left on this page: stay put and swap the audio.
    const position = view.leaves.indexOf(chapterIndex)
    const onwards = view.leaves[position + 1]
    if (onwards !== undefined) {
      void goToChapterOnPage(book, onwards)
      return
    }

    // Page finished: the next page at this level. Because those pages tile the
    // book, this crosses from the last chapter of one section into the first of
    // the next without stepping over anything in between.
    const following = nextView(tree, view)
    if (following) void openView(book, following)
  }, [book, chapterIndex, goToChapterOnPage, openView, tree, view])

  // Held in a ref so the playback hook keeps one stable callback while the
  // logic behind it sees current state. Written in an effect, not during render.
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // Book selection: load its contents and reopen where reading stopped.
  const openBook = useCallback(
    async (bookId: string) => {
      const record = await db.getBook(bookId)
      if (!record) return

      const [chapters, progress] = await Promise.all([
        loadOutline(record),
        db.getProgress(bookId),
      ])

      const bookTree = record.nav ?? flatTree(chapters.map((c) => c.title))
      const index = progress?.chapterIndex ?? 0
      const target =
        viewContaining(bookTree, Number.MAX_SAFE_INTEGER, index) ??
        viewsAtDepth(bookTree, 0)[0]
      if (!target) return

      await openView(
        record,
        target,
        index,
        progress
          ? { chapterIndex: index, sentenceId: progress.sentenceId, audioTime: progress.audioTime }
          : undefined,
        chapters,
      )
      log.log(`[${bookId}] opened — ${chapters.length} chapters`)
    },
    [openView],
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
    (!audio || (activeChapter?.timeline.length ?? 0) === 0)

  useEffect(() => {
    if (!book || !incomplete || !view) return
    let cancelled = false

    void Promise.all([
      loadView(book, view.leaves),
      loadChapterAudio(book, chapterIndex),
    ]).then(([content, clip]) => {
      if (cancelled) return
      // Only replace the page once the chapter being read actually gained its
      // timings — swapping in another timing-less copy restarts this cycle.
      const refreshed = content.find((c) => c.index === chapterIndex)
      if (refreshed && refreshed.timeline.length > 0) setPages(content)
      // This runs again every time a background chapter finishes converting,
      // and the cache is cleared between them — so `clip` is a NEW Blob holding
      // the same bytes. Handing it over would change the audio's identity, and
      // the engine rebuilds its element for a new blob: the chapter being
      // listened to would stop and start again from 0:00. A chapter's audio
      // never changes once it exists, so take a clip only when there is none.
      setAudio((current) => current ?? clip)
    })

    return () => { cancelled = true }
  }, [book, book?.status, book?.updatedAt, chapterIndex, incomplete, view])

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

  const chapterReady = Boolean(activeChapter) && (book?.mode === 'live' || Boolean(audio))

  /** Chapters with no audio yet, so the tree can show what is not ready. */
  const pendingChapters = useMemo(
    () => new Set(outline.filter((entry) => !entry.narrated).map((entry) => entry.index)),
    [outline],
  )

  // Stepping with the transport moves one page at a time, matching the level
  // the reader chose in the tree.
  const viewsAtThisLevel = useMemo(
    () => (view ? viewsAtDepth(tree, view.depth) : []),
    [tree, view],
  )
  const viewPosition = view
    ? viewsAtThisLevel.findIndex((candidate) => candidate.id === view.id)
    : -1

  const stepView = useCallback(
    (delta: number) => {
      const target = viewsAtThisLevel[viewPosition + delta]
      if (book && target) void openView(book, target)
    },
    [book, openView, viewPosition, viewsAtThisLevel],
  )

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
          <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 max-h-[45%] overflow-y-auto border-b border-border">
              <BookRail onAdd={() => setShowUpload(true)} onSelect={selectBook} />
            </div>
            {book && tree.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <p className="px-1 pb-1 text-[0.65rem] uppercase tracking-wide text-on-surface-muted/70">
                  Contents
                </p>
                <ChapterTree
                  tree={tree}
                  selectedId={view?.id ?? null}
                  // Only while something is actually being spoken: `chapterIndex`
                  // is 0 when nothing is, which would mark the first chapter of
                  // the book as playing from the moment the library opens.
                  playingChapter={state.playing ? chapterIndex : null}
                  pendingChapters={pendingChapters}
                  onSelect={selectNode}
                />
              </div>
            )}
          </div>
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
              <ConversionPanel
                book={book}
                job={job}
                speed={settings.speed}
                voiceId={settings.voiceId}
              />

              {pages.length > 0 ? (
                <Reader
                  key={view?.id}
                  chapters={pages}
                  activeChapterIndex={chapterIndex}
                  activeSentenceId={state.activeSentenceId}
                  wordRange={state.wordRange}
                  autoFollow={settings.autoFollow}
                  fontSizeRem={settings.fontSizeRem}
                  onSeekToSentence={handleSeekToSentence}
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
                chapterTitle={view?.title ?? ''}
                chapterIndex={Math.max(viewPosition, 0)}
                chapterCount={Math.max(viewsAtThisLevel.length, 1)}
                ready={chapterReady}
                onToggle={handleToggle}
                onSeek={seekTo}
                onRate={handleRate}
                onChapter={(index) => stepView(index - viewPosition)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
