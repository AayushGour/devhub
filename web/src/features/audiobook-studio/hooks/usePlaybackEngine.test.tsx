// A sentence is identified by its chapter AND its id, never by its id alone.
//
// Sentence ids restart at s1 in every chapter, and a branch selection puts a
// whole section of them on one scrollable page. Looking a bare id up in
// whichever timeline happens to be loaded is joining two collections by
// position instead of by key: clicking a line in chapter 6 while chapter 3 is
// playing either jumps to chapter 3's sentence with that id, or — when no such
// id exists there — does nothing at all. Both are silent.
//
// The other half of this file is StrictMode. The app runs inside it, so every
// effect that builds the audio element runs setup, cleanup, setup. Anything
// consumed on the first pass is gone by the second, and the second pass owns
// the element the reader actually hears.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { usePlaybackEngine, type StoredPosition } from './usePlaybackEngine'
import type { ReadableChapter } from '../utils/bookSource'
import type { BookMode } from '../types'

/**
 * Stands in for the audio element.
 *
 * jsdom has no media pipeline — play() throws and readyState never leaves 0 —
 * so the element is faked at the seam the hook actually uses: a few properties
 * plus real event dispatch, which is what the restore and autoplay paths hang
 * off.
 */
class FakeAudio extends EventTarget {
  static built: FakeAudio[] = []

  readonly src: string
  preload = ''
  playbackRate = 1
  currentTime = 0
  duration = 60
  readyState = 0
  playing = false

  constructor(src: string) {
    super()
    this.src = src
    FakeAudio.built.push(this)
  }

  play(): Promise<void> {
    this.playing = true
    return Promise.resolve()
  }

  pause(): void {
    this.playing = false
  }

  removeAttribute(): void {}

  /** The metadata and first frames arriving, which is what unblocks seeking. */
  arrive(): void {
    this.readyState = 4
    this.dispatchEvent(new Event('loadedmetadata'))
    this.dispatchEvent(new Event('canplay'))
  }
}

/** The element the reader is left with — StrictMode throws the first one away. */
const live = () => FakeAudio.built[FakeAudio.built.length - 1]

beforeEach(() => {
  FakeAudio.built = []
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:chapter'),
    revokeObjectURL: vi.fn(),
  }))
  // The animation loop only mirrors the element's clock into state; running it
  // here would add render noise to assertions about the element itself.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Three sentences a chapter, ten seconds each, ids restarting every chapter. */
function chapter(index: number, count = 3): ReadableChapter {
  const sentences = Array.from({ length: count }, (_, i) => ({
    id: `s${i + 1}`,
    blockIdx: 0,
    blockType: 'p' as const,
    text: `Chapter ${index}, sentence ${i + 1}.`,
    chunks: [],
    endsBlock: i === count - 1,
  }))
  return {
    index,
    title: `Chapter ${index}`,
    blocks: [{ type: 'p', text: sentences.map((s) => s.text).join(' ') }],
    sentences,
    timeline: sentences.map((sentence, i) => ({
      id: sentence.id,
      text: sentence.text,
      clipBegin: i * 10,
      clipEnd: i * 10 + 10,
    })),
  }
}

interface Props {
  mode: BookMode
  chapter: ReadableChapter | null
  audio: Blob | null
  initialPosition?: StoredPosition | null
  onChapterEnd?: () => void
}

const clip = () => new Blob(['audio'], { type: 'audio/mpeg' })

function mount(props: Props) {
  return renderHook(
    (current: Props) => usePlaybackEngine({ ...current, rate: 1 }),
    { initialProps: props, wrapper: StrictMode },
  )
}

describe('seeking to a sentence', () => {
  it('seeks the sentence named by the chapter it was clicked in', () => {
    const { result } = mount({ mode: 'narrated', chapter: chapter(3), audio: clip() })
    act(() => live().arrive())

    act(() => result.current.seekToSentence(3, 's3'))

    expect(live().currentTime).toBe(20)
    expect(result.current.state.activeSentenceId).toBe('s3')
  })

  // The defect: chapters 3..8 on one page, chapter 3 loaded, a click in
  // chapter 6. The id alone matches a sentence in chapter 3's timeline, and
  // playback used to jump there — the wrong chapter, silently.
  it('does not seek the loaded chapter for a click that belongs to another', () => {
    const { result } = mount({ mode: 'narrated', chapter: chapter(3), audio: clip() })
    act(() => live().arrive())
    act(() => result.current.seekTo(5))

    act(() => result.current.seekToSentence(6, 's3'))

    expect(live().currentTime).toBe(5)
  })

  it('holds the click until that chapter is the one loaded, then plays it', () => {
    const { result, rerender } = mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
    })
    act(() => live().arrive())
    const first = live()

    act(() => result.current.seekToSentence(6, 's2'))
    // The page swaps in chapter 6's audio, the way a click in the reader does.
    rerender({ mode: 'narrated', chapter: chapter(6), audio: clip() })
    act(() => live().arrive())

    expect(live()).not.toBe(first)
    expect(live().currentTime).toBe(10)
    expect(live().playing).toBe(true)
  })

  it('forgets a held click once the reader goes somewhere else entirely', () => {
    const { result, rerender } = mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
    })
    act(() => live().arrive())

    act(() => result.current.seekToSentence(6, 's2'))
    rerender({ mode: 'narrated', chapter: chapter(4), audio: clip() })
    act(() => live().arrive())
    rerender({ mode: 'narrated', chapter: chapter(6), audio: clip() })
    act(() => live().arrive())

    expect(live().currentTime).toBe(0)
    expect(live().playing).toBe(false)
  })

  it('moves the highlight when a paused book is scrubbed', () => {
    const { result } = mount({ mode: 'narrated', chapter: chapter(3), audio: clip() })
    act(() => live().arrive())

    act(() => result.current.seekTo(15))

    expect(result.current.state.activeSentenceId).toBe('s2')
    expect(result.current.state.activeIndex).toBe(1)
    expect(result.current.state.playing).toBe(false)
  })
})

describe('restoring where reading stopped', () => {
  // The element is built twice under StrictMode. A position consumed by the
  // first pass leaves the second — the element that survives — at 0:00, which
  // is every development reload of every book.
  it('applies the stored position to the element that survives StrictMode', () => {
    mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
      initialPosition: { chapterIndex: 3, sentenceId: 's2', audioTime: 12 },
    })

    expect(FakeAudio.built.length).toBeGreaterThan(1)
    act(() => live().arrive())
    expect(live().currentTime).toBe(12)
  })

  it('leaves later chapters at the top', () => {
    const { rerender } = mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
      initialPosition: { chapterIndex: 3, sentenceId: 's2', audioTime: 12 },
    })
    act(() => live().arrive())

    rerender({ mode: 'narrated', chapter: chapter(4), audio: clip() })
    act(() => live().arrive())

    expect(live().currentTime).toBe(0)
  })

  // Opening a book from the rail asks for the restore while the book being
  // left is still in the element; the chapter it names arrives a commit later.
  it('waits for the chapter a restore names rather than moving the one on screen', () => {
    const { result, rerender } = mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
    })
    act(() => live().arrive())
    const leaving = live()

    act(() => result.current.restore({ chapterIndex: 9, sentenceId: 's2', audioTime: 14 }))
    expect(leaving.currentTime).toBe(0)

    rerender({ mode: 'narrated', chapter: chapter(9), audio: clip() })
    act(() => live().arrive())

    expect(live().currentTime).toBe(14)
    // Restoring is not playing — it only reopens the book where it was left.
    expect(live().playing).toBe(false)
  })
})

describe('reaching the end of a chapter', () => {
  // The page answers by swapping the next chapter's audio in; the engine is
  // what remembers that the reader was in the middle of listening.
  it('carries on into the next chapter rather than stopping at the break', () => {
    const onChapterEnd = vi.fn()
    const { rerender } = mount({
      mode: 'narrated',
      chapter: chapter(3),
      audio: clip(),
      onChapterEnd,
    })
    act(() => live().arrive())

    act(() => { live().dispatchEvent(new Event('ended')) })
    expect(onChapterEnd).toHaveBeenCalled()

    rerender({ mode: 'narrated', chapter: chapter(4), audio: clip(), onChapterEnd })
    act(() => live().arrive())

    expect(live().playing).toBe(true)
    expect(live().currentTime).toBe(0)
  })
})

describe('a live book', () => {
  it('has no seekable clock and reports itself as live', () => {
    const { result } = mount({ mode: 'live', chapter: chapter(3), audio: null })

    expect(result.current.state.live).toBe(true)
    expect(FakeAudio.built).toHaveLength(0)
  })
})
