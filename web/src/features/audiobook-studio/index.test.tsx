// Opening the library is a side effect, and it runs from a useState initialiser.
//
// StrictMode double-invokes those, so the whole of `openLibrary` used to run
// twice on every mount: the active book chosen twice, the outline read twice,
// and — the one that costs something — `resumeInterrupted` queueing every
// half-converted book for narration twice over.
//
// The other half of this file is the page's other identity problem. While a
// book is still converting, the page refetches the open chapter every time the
// book record changes. The audio cache is cleared after every narrated chapter,
// so each refetch produces a NEW Blob holding the same bytes — and handing that
// to the engine rebuilds its audio element, stopping the chapter the reader is
// in the middle of and starting it again from 0:00.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { BookRecord } from './types'

const resumeInterrupted = vi.hoisted(() => vi.fn(async () => {}))
const loadOutline = vi.hoisted(() => vi.fn(async () => [
  { index: 0, title: 'Dune', durationSec: 60, narrated: true },
]))
const setActiveBook = vi.hoisted(() => vi.fn())

/** Every blob the page has handed the playback engine, in order. */
const handedToEngine = vi.hoisted(() => [] as (Blob | null)[])

const book: BookRecord = {
  id: 'b1',
  title: 'Dune',
  author: 'Frank Herbert',
  language: 'en',
  sourceName: 'dune.epub',
  sourceType: 'epub',
  mode: 'narrated',
  voiceId: 'af_heart',
  status: 'ready',
  chapterCount: 1,
  durationSec: 60,
  createdAt: 0,
  updatedAt: 0,
}

const store = vi.hoisted(() => ({
  books: [] as BookRecord[],
  settings: {
    key: 'default' as const,
    voiceId: 'af_heart',
    speed: 1,
    playbackRate: 1,
    fontSizeRem: 1,
    autoFollow: true,
  },
  railCollapsed: false,
  refreshBooks: vi.fn(async () => {}),
  loadSettings: vi.fn(async () => {}),
  saveSettings: vi.fn(async () => {}),
  setActiveBook: vi.fn(),
  toggleRail: vi.fn(),
  autoCollapseRail: vi.fn(),
}))

vi.mock('./store/audiobookStore', () => ({
  useAudiobookStore: Object.assign(
    (select: (state: typeof store) => unknown) => select(store),
    { getState: () => store },
  ),
  useJob: () => undefined,
}))

vi.mock('./utils/conversionEngine', () => ({
  resumeInterrupted,
  importFile: vi.fn(async () => 'b1'),
}))

vi.mock('./utils/bookSource', () => ({
  clearBookCache: vi.fn(),
  loadOutline,
  // A fresh Blob every call, exactly like the cache does once it is cleared.
  loadChapterAudio: vi.fn(async () => new Blob(['audio'], { type: 'audio/mpeg' })),
  // No timings yet: this is a chapter whose narration has not landed, which is
  // what keeps the page refetching while the rest of the book converts.
  loadView: vi.fn(async () => [
    { index: 0, title: 'Dune', blocks: [], sentences: [], timeline: [] },
  ]),
}))

// Only the options matter here — what the page decides to hand over, and when.
vi.mock('./hooks/usePlaybackEngine', () => ({
  usePlaybackEngine: ({ audio }: { audio: Blob | null }) => {
    handedToEngine.push(audio)
    return {
      state: {
        playing: false,
        currentTime: 0,
        duration: 0,
        activeIndex: -1,
        activeSentenceId: null,
        wordRange: null,
        live: false,
      },
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      seekTo: vi.fn(),
      seekToSentence: vi.fn(),
      restore: vi.fn(),
    }
  },
}))

vi.mock('./utils/db', () => ({
  getBook: vi.fn(async () => book),
  getProgress: vi.fn(async () => undefined),
  putProgress: vi.fn(async () => {}),
}))

// The page itself is what is under test; its children only have to render.
vi.mock('@/components/ui/CollapsiblePanel', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./components/BookRail', () => ({ default: () => <div /> }))
vi.mock('./components/ChapterTree', () => ({ default: () => <div /> }))
vi.mock('./components/ConversionPanel', () => ({ default: () => <div /> }))
vi.mock('./components/ModelOverlay', () => ({ default: () => <div /> }))
vi.mock('./components/TransportBar', () => ({ default: () => <div /> }))
vi.mock('./components/UploadDialog', () => ({ default: () => <div>Add a book</div> }))
vi.mock('./components/Reader', () => ({
  default: () => <div data-testid="reader">Dune</div>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  handedToEngine.length = 0
  store.books = [book]
  store.setActiveBook = setActiveBook
})

/** A fresh module, so the page opens the library as if visited for the first time. */
async function visit() {
  // The previous visit is left behind, the way navigating away does.
  cleanup()
  const { default: AudiobookStudioPage } = await import('./index')
  const tree = (
    <StrictMode>
      <AudiobookStudioPage />
    </StrictMode>
  )
  let view!: ReturnType<typeof render>
  // Awaited, because the page suspends on the library it is opening.
  await act(async () => { view = render(tree) })
  await screen.findByTestId('reader')

  let touched = 0
  /** A chapter elsewhere in the book finishing, which restamps the record. */
  const chapterConverted = async () => {
    touched += 1
    store.books = [{ ...book, status: 'narrating', updatedAt: touched }]
    await act(async () => { view.rerender(tree) })
  }
  return { chapterConverted }
}

describe('opening the library', () => {
  it('queues interrupted conversions once per visit, not once per StrictMode pass', async () => {
    await visit()

    expect(resumeInterrupted).toHaveBeenCalledTimes(1)
    expect(setActiveBook).toHaveBeenCalledTimes(1)
    expect(loadOutline).toHaveBeenCalledTimes(1)
  })

  it('opens the library again on a later visit rather than replaying a stale one', async () => {
    await visit()
    await visit()

    expect(resumeInterrupted).toHaveBeenCalledTimes(2)
  })
})

describe('a book still converting in the background', () => {
  // Same bytes, new Blob: the only thing that changed is the identity, and
  // identity is what makes the engine throw its audio element away.
  it('does not hand the engine a second copy of the audio it is already playing', async () => {
    const { chapterConverted } = await visit()
    const opened = handedToEngine.at(-1)

    await chapterConverted()
    await chapterConverted()

    expect(opened).toBeInstanceOf(Blob)
    expect(new Set(handedToEngine).size).toBe(1)
    expect(handedToEngine.at(-1)).toBe(opened)
  })
})
