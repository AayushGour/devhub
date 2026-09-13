// One playback interface over two unrelated timelines.
//
// narrated: a real audio element. currentTime is authoritative, seeking is
//   exact, and the highlight is driven by binary-searching the SMIL timings.
// live: speechSynthesis. There is no audio buffer, so there is no clock to
//   seek — position is the index of the utterance currently speaking, and the
//   word highlight comes from the engine's own boundary events.
//
// Components consume the same shape either way; only the transport bar cares
// which, because a live book has no seekable duration to draw.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  findSentenceAt,
  timelineDuration,
  tokenizeWords,
  wordSpanAt,
  type WordSpan,
} from '../utils/timeline'
import type { ReadableChapter } from '../utils/bookSource'
import type { BookMode } from '../types'

export interface PlaybackState {
  playing: boolean
  /** Seconds into the chapter. Always 0 for live playback. */
  currentTime: number
  /** Chapter length in seconds, or 0 when there is no audio to measure. */
  duration: number
  activeIndex: number
  activeSentenceId: string | null
  wordRange: WordSpan | null
  /** True when the engine has no audio and cannot seek. */
  live: boolean
}

export interface StoredPosition {
  /**
   * The chapter the position was saved in. Carried with the position because
   * sentence ids restart at s1 in every chapter — the id alone does not say
   * which chapter it belongs to.
   */
  chapterIndex: number
  sentenceId: string
  audioTime: number
}

interface Options {
  mode: BookMode
  chapter: ReadableChapter | null
  /**
   * The chapter's audio. The hook makes its own object URL from this and
   * revokes it when the element goes away — the element is the only thing that
   * knows when the URL is finished with.
   */
  audio: Blob | null
  rate: number
  /**
   * Where reading stopped last session. Applied to the audio element as it is
   * created, and only for the chapter it names — seeding the element directly
   * rather than seeking after the fact avoids a frame of playback from the top
   * of the chapter.
   */
  initialPosition?: StoredPosition | null
  onChapterEnd?: () => void
}

const IDLE: PlaybackState = {
  playing: false,
  currentTime: 0,
  duration: 0,
  activeIndex: -1,
  activeSentenceId: null,
  wordRange: null,
  live: false,
}

export function usePlaybackEngine({
  mode,
  chapter,
  audio,
  rate,
  initialPosition,
  onChapterEnd,
}: Options) {
  const [state, setState] = useState<PlaybackState>(() =>
    initialPosition
      ? { ...IDLE, activeSentenceId: initialPosition.sentenceId, currentTime: initialPosition.audioTime }
      : IDLE,
  )

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const frameRef = useRef(0)
  const liveIndexRef = useRef(0)
  const onEndRef = useRef(onChapterEnd)
  /**
   * Where reading stopped, and the chapter it belongs to.
   *
   * Matched against the chapter rather than consumed by whichever effect reads
   * it first. StrictMode builds the element twice — setup, cleanup, setup — so
   * a position cleared on the first pass leaves the second, the element that
   * actually survives, starting the chapter at 0:00. Matching is idempotent;
   * consuming is not.
   */
  const pendingRestore = useRef<StoredPosition | null>(initialPosition ?? null)
  /**
   * A sentence clicked in a chapter whose audio is not loaded yet. Held for the
   * same reason and in the same way as the stored position: the element for
   * that chapter does not exist at the moment of the click.
   */
  const pendingSeek = useRef<{ chapterIndex: number; sentenceId: string } | null>(null)
  /**
   * Set when a chapter ended while playing. The next chapter's audio does not
   * exist yet at that moment, so the intent is held here and acted on once the
   * element for it has been built.
   */
  const continuePlaying = useRef(false)

  // Written in an effect rather than during render — a ref is not readable or
  // writable while rendering.
  useEffect(() => {
    onEndRef.current = onChapterEnd
  }, [onChapterEnd])

  // Both held requests name one chapter, and are dropped once the reader has
  // left it — that, and not the act of reading them, is what makes "the stored
  // position is used once; later chapters start at zero" true. Clearing here is
  // safe to repeat, so StrictMode's second pass changes nothing.
  useEffect(() => {
    // No chapter at all means nothing has been loaded yet, not that the reader
    // has moved on — a request made before its chapter is readable still waits.
    if (!chapter) return
    if (pendingRestore.current && pendingRestore.current.chapterIndex !== chapter.index) {
      pendingRestore.current = null
    }
    if (pendingSeek.current && pendingSeek.current.chapterIndex !== chapter.index) {
      pendingSeek.current = null
    }
  }, [chapter])

  // Playback position belongs to one chapter. Without clearing it when the
  // chapter changes, the old position survives into the new one — and because
  // the page writes progress under whichever book is active, switching books
  // saves the previous book's position onto the new book's record.
  //
  // Adjusting state during render (rather than in an effect) is the documented
  // way to reset state on a prop change, and avoids a frame that highlights a
  // sentence belonging to the chapter just left.
  const [trackedChapter, setTrackedChapter] = useState(chapter)
  if (chapter !== trackedChapter) {
    setTrackedChapter(chapter)
    setState(IDLE)
  }

  const live = mode === 'live'
  // Stable identity, so the callbacks below are not rebuilt on every render.
  const timeline = useMemo(() => chapter?.timeline ?? [], [chapter])

  // Word offsets are stable per sentence; computing them once per chapter keeps
  // the animation frame free of string work.
  const wordsBySentence = useMemo(() => {
    const map = new Map<string, WordSpan[]>()
    for (const sentence of chapter?.sentences ?? []) {
      map.set(sentence.id, tokenizeWords(sentence.text))
    }
    return map
  }, [chapter])

  const stopTracking = useCallback(() => cancelAnimationFrame(frameRef.current), [])

  // speakFrom is declared further down; the chapter effect needs it earlier.
  const speakFromRef = useRef<((index: number) => void) | null>(null)

  /**
   * Resolve a playback time to a highlight position.
   *
   * Shared by the animation loop and by seeking, because the highlight has to
   * follow the clock whether or not anything is playing — scrubbing a paused
   * book must move the highlight too, not just the scrubber.
   */
  const positionAt = useCallback(
    (time: number): Pick<PlaybackState, 'activeIndex' | 'activeSentenceId' | 'wordRange'> => {
      if (timeline.length === 0) {
        return { activeIndex: -1, activeSentenceId: null, wordRange: null }
      }
      const index = findSentenceAt(timeline, time)
      const entry = index >= 0 ? timeline[index] : null
      return {
        activeIndex: index,
        activeSentenceId: entry?.id ?? null,
        wordRange: entry ? wordSpanAt(entry, time, wordsBySentence.get(entry.id)) : null,
      }
    },
    [timeline, wordsBySentence],
  )

  const track = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current
      if (audio && timeline.length > 0) {
        setState((prev) => ({
          ...prev,
          currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : prev.duration,
          ...positionAt(audio.currentTime),
        }))
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)
  }, [positionAt, timeline])

  // Build the element for the current chapter. Recreated per chapter so seeking
  // and duration always refer to the audio actually on screen.
  useEffect(() => {
    if (live || !audio) return

    const url = URL.createObjectURL(audio)
    const element = new Audio(url)
    element.preload = 'metadata'
    element.playbackRate = rate
    audioRef.current = element

    // Both requests are read, never cleared: this body runs twice when an
    // element is built under StrictMode, and a request consumed on the first
    // pass would leave the element that survives sitting at 0:00. They are
    // matched by chapter and dropped when the reader leaves it instead.
    const held = pendingSeek.current
    const clicked =
      held && chapter && held.chapterIndex === chapter.index
        ? timeline.find((s) => s.id === held.sentenceId)
        : undefined
    const stored =
      pendingRestore.current && chapter && pendingRestore.current.chapterIndex === chapter.index
        ? pendingRestore.current
        : null

    const startAt = clicked ? clicked.clipBegin : stored?.audioTime
    if (startAt !== undefined) {
      // currentTime is only settable once metadata has arrived.
      const seek = () => { element.currentTime = startAt }
      if (element.readyState >= 1) seek()
      else element.addEventListener('loadedmetadata', seek, { once: true })
    }

    // The element is the authority on where it landed. Mirroring its clock back
    // into state is what puts the scrubber and the highlight on a restored
    // position before anything has played — the animation loop, which is the
    // only other thing that reads the clock, runs only while playing.
    const onSeeked = () => {
      setState((prev) => ({
        ...prev,
        currentTime: element.currentTime,
        ...positionAt(element.currentTime),
      }))
    }
    element.addEventListener('seeked', onSeeked)

    // Duration is otherwise only learned inside the animation loop, which runs
    // only while playing — leaving the scrubber pinned to zero, and clamping
    // every seek, until something has played at least once.
    const onMetadata = () => {
      if (Number.isFinite(element.duration)) {
        setState((prev) => ({ ...prev, duration: element.duration }))
      }
    }
    element.addEventListener('loadedmetadata', onMetadata)

    const onEnded = () => {
      cancelAnimationFrame(frameRef.current)
      setState((prev) => ({ ...prev, playing: false }))
      // Ask the next chapter to start itself, if there is one.
      continuePlaying.current = true
      onEndRef.current?.()
    }
    element.addEventListener('ended', onEnded)

    // Carrying on into the next chapter, rather than stopping at every break —
    // or into the chapter whose sentence was just clicked, which is a request
    // to play from there, not merely to move the cursor.
    if (continuePlaying.current || clicked) {
      continuePlaying.current = false
      const resume = () => {
        void element.play()
        setState((prev) => ({ ...prev, playing: true }))
        track()
      }
      if (element.readyState >= 2) resume()
      else element.addEventListener('canplay', resume, { once: true })
    }

    return () => {
      element.removeEventListener('loadedmetadata', onMetadata)
      element.removeEventListener('seeked', onSeeked)
      element.removeEventListener('ended', onEnded)
      element.pause()
      element.removeAttribute('src')
      // Revoked here and nowhere else: this is the only place that knows the
      // element is done with it.
      URL.revokeObjectURL(url)
      cancelAnimationFrame(frameRef.current)
      audioRef.current = null
    }
    // `rate` is applied separately so changing speed does not rebuild the element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, live])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  // Stop any speech when the chapter changes or the component unmounts —
  // speechSynthesis is global and outlives React otherwise. The live cursor is
  // reset here rather than during render, where refs are off limits.
  useEffect(() => {
    liveIndexRef.current = 0

    // A live book has no clock to seek, so a held position is simply where in
    // the sentence list to pick the reading back up.
    const stored = pendingRestore.current
    if (live && chapter && stored && stored.chapterIndex === chapter.index) {
      const index = chapter.sentences.findIndex((s) => s.id === stored.sentenceId)
      liveIndexRef.current = Math.max(0, index)
    }

    // Deferred by a microtask so the speech engine is started from outside the
    // effect body — it is an external system, and speaking sets state.
    if (live && chapter && continuePlaying.current) {
      continuePlaying.current = false
      queueMicrotask(() => speakFromRef.current?.(0))
    }

    // A sentence clicked in a chapter that was not loaded yet. Read, not
    // consumed, for the same reason the audio element reads it that way.
    const held = pendingSeek.current
    if (live && chapter && held && held.chapterIndex === chapter.index) {
      const index = chapter.sentences.findIndex((s) => s.id === held.sentenceId)
      if (index >= 0) queueMicrotask(() => speakFromRef.current?.(index))
    }

    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
      cancelAnimationFrame(frameRef.current)
    }
  }, [chapter, live])

  const speakFrom = useCallback(
    (startIndex: number) => {
      if (typeof speechSynthesis === 'undefined' || !chapter) return
      speechSynthesis.cancel()
      liveIndexRef.current = startIndex

      const speakNext = () => {
        const index = liveIndexRef.current
        const sentence = chapter.sentences[index]
        if (!sentence) {
          setState((prev) => ({ ...prev, playing: false, activeSentenceId: null }))
          continuePlaying.current = true
          onEndRef.current?.()
          return
        }

        const utterance = new SpeechSynthesisUtterance(sentence.text)
        utterance.rate = rate

        setState((prev) => ({
          ...prev,
          playing: true,
          live: true,
          activeIndex: index,
          activeSentenceId: sentence.id,
          wordRange: null,
        }))

        // charIndex is the engine's own word boundary — more accurate than the
        // interpolation the narrated path has to use.
        utterance.onboundary = (event) => {
          if (event.name && event.name !== 'word') return
          const words = wordsBySentence.get(sentence.id) ?? []
          const word = words.find((w) => event.charIndex >= w.start && event.charIndex < w.end)
          setState((prev) => ({ ...prev, wordRange: word ?? prev.wordRange }))
        }

        utterance.onend = () => {
          liveIndexRef.current += 1
          speakNext()
        }

        speechSynthesis.speak(utterance)
      }

      speakNext()
    },
    [chapter, rate, wordsBySentence],
  )

  // Written in an effect, not during render. The chapter effect defers its use
  // to a microtask, which runs after every effect has flushed, so the current
  // function is always in place by the time it is called.
  useEffect(() => {
    speakFromRef.current = speakFrom
  }, [speakFrom])

  const play = useCallback(() => {
    // Reading on from here: a held position must not pull the element back to
    // where the last session stopped if it is ever rebuilt.
    pendingRestore.current = null
    if (live) {
      speakFrom(liveIndexRef.current)
      return
    }
    const audio = audioRef.current
    if (!audio) return
    void audio.play()
    setState((prev) => ({ ...prev, playing: true }))
    track()
  }, [live, speakFrom, track])

  const pause = useCallback(() => {
    // An explicit pause means stop, including at a chapter boundary.
    continuePlaying.current = false
    if (live) {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
      setState((prev) => ({ ...prev, playing: false }))
      return
    }
    audioRef.current?.pause()
    stopTracking()
    setState((prev) => ({ ...prev, playing: false }))
  }, [live, stopTracking])

  // Read the flag, do not mutate state to read it: a setState updater must be
  // pure, and play()/pause() set state themselves — nesting an update inside an
  // update makes playback fire twice under StrictMode.
  const toggle = useCallback(() => {
    if (state.playing) pause()
    else play()
  }, [pause, play, state.playing])

  const seekTo = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      if (!audio) return
      // Moved by hand, so the position saved last session no longer applies.
      pendingRestore.current = null
      const time = Math.max(0, seconds)
      audio.currentTime = time
      setState((prev) => ({ ...prev, currentTime: time, ...positionAt(time) }))
    },
    [positionAt],
  )

  /**
   * Play from a sentence, named by the chapter it belongs to.
   *
   * The chapter is half of the key, not decoration: sentence ids restart at s1
   * in every chapter, and a page can hold several of them at once. Looking an
   * id up in whatever timeline happens to be loaded finds the sentence with
   * that id in the WRONG chapter — or, when the chapter loaded is shorter than
   * the one clicked, finds nothing and the click does nothing at all.
   */
  const seekToSentence = useCallback(
    (chapterIndex: number, sentenceId: string) => {
      // Not the chapter in the engine: its audio is still being fetched by the
      // page, so the request waits for the element that will play it.
      if (!chapter || chapter.index !== chapterIndex) {
        pendingSeek.current = { chapterIndex, sentenceId }
        return
      }
      pendingSeek.current = null

      if (live) {
        const index = chapter.sentences.findIndex((s) => s.id === sentenceId)
        if (index >= 0) speakFrom(index)
        return
      }
      const entry = timeline.find((s) => s.id === sentenceId)
      if (!entry) return
      seekTo(entry.clipBegin)
      play()
    },
    [chapter, live, play, seekTo, speakFrom, timeline],
  )

  /**
   * Resume at a stored position without starting playback.
   *
   * The position names its own chapter, which is not always the one loaded:
   * opening a book from the rail asks for this while the previous book's audio
   * is still in the element. Held for the chapter it belongs to rather than
   * written to whatever is on screen.
   */
  const restore = useCallback(
    (position: StoredPosition) => {
      pendingRestore.current = position
      if (!chapter || chapter.index !== position.chapterIndex) return

      if (live) {
        const index = chapter.sentences.findIndex((s) => s.id === position.sentenceId)
        liveIndexRef.current = Math.max(0, index)
        setState((prev) => ({ ...prev, activeSentenceId: position.sentenceId }))
        return
      }
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = position.audioTime
      const at = positionAt(position.audioTime)
      setState((prev) => ({
        ...prev,
        currentTime: position.audioTime,
        ...at,
        activeSentenceId: at.activeSentenceId ?? position.sentenceId,
      }))
    },
    [chapter, live, positionAt],
  )

  // The overlay's own timings give an authoritative length before any audio is
  // fetched, so the transport is usable from the moment a chapter is open.
  const duration = state.duration || timelineDuration(timeline)

  return {
    state: { ...state, live, duration },
    play,
    pause,
    toggle,
    seekTo,
    seekToSentence,
    restore,
  }
}
