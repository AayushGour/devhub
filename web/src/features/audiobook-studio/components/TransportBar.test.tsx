// The scrubber and the animation loop both want to own the thumb.
//
// The loop writes the element's clock into state on every frame, and setting
// `audio.currentTime` does not land until the element has seeked. A range input
// bound straight to that clock is therefore re-rendered with the OLD time
// between the drag and the seek — the thumb jumps back under the reader's
// finger, and a long drag turns into a fight. While a drag is in progress the
// input has to show where the reader put it.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransportBar from './TransportBar'
import type { PlaybackState } from '../hooks/usePlaybackEngine'

const state = (patch: Partial<PlaybackState> = {}): PlaybackState => ({
  playing: true,
  currentTime: 3,
  duration: 100,
  activeIndex: 0,
  activeSentenceId: 's1',
  wordRange: null,
  live: false,
  ...patch,
})

function show(current: PlaybackState, onSeek = vi.fn()) {
  const props = {
    rate: 1,
    chapterTitle: 'The Sleeper Must Awaken',
    chapterIndex: 0,
    chapterCount: 4,
    ready: true,
    onToggle: vi.fn(),
    onSeek,
    onRate: vi.fn(),
    onChapter: vi.fn(),
  }
  const view = render(<TransportBar state={current} {...props} />)
  return {
    onSeek,
    slider: () => screen.getByRole('slider') as HTMLInputElement,
    // The engine reporting a time — stale during a drag, current after it.
    clock: (seconds: number) =>
      view.rerender(<TransportBar state={state({ currentTime: seconds })} {...props} />),
  }
}

describe('scrubbing', () => {
  it('holds the thumb where it was dragged while the engine catches up', () => {
    const { slider, onSeek, clock } = show(state())

    fireEvent.change(slider(), { target: { value: '42' } })
    // The seek is out, but the element has not moved yet and the animation
    // loop is still reporting the position it started from.
    expect(onSeek).toHaveBeenCalledWith(42)
    clock(3.2)

    expect(slider().value).toBe('42')
    expect(screen.getByText('0:42')).toBeInTheDocument()
  })

  it('hands the thumb back to the engine once the drag is let go', () => {
    const { slider, clock } = show(state())

    fireEvent.change(slider(), { target: { value: '42' } })
    fireEvent.pointerUp(slider())
    clock(43)

    expect(slider().value).toBe('43')
  })

  // Arrow keys scrub too, and they never produce a pointer event.
  it('hands it back after a keyboard scrub as well', () => {
    const { slider, clock } = show(state())

    fireEvent.change(slider(), { target: { value: '42' } })
    fireEvent.keyUp(slider(), { key: 'ArrowRight' })
    clock(42.4)

    expect(slider().value).toBe('42.4')
  })

  it('follows the engine when nothing is being dragged', () => {
    const { slider, clock } = show(state())

    clock(17)

    expect(slider().value).toBe('17')
  })

  it('has no scrubber at all for a book read aloud live', () => {
    show(state({ live: true }))

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByText(/read aloud live/)).toBeInTheDocument()
  })
})
