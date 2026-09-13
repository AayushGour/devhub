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
   * Where reading stopped last session. Applied once, to the audio element as
   * it is created — seeding the element directly rather than seeking after the
   * fact avoids a frame of playback from the top of the chapter.
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
  // The stored position is consumed once; later chapters start at zero.
  const pendingRestore = useRef(initialPosition ?? null)

  // Written in an effect rather than during render — a ref is not readable or
  // writable while rendering.
  useEffect(() => {
    onEndRef.current = onChapterEnd
  }, [onChapterEnd])

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

    const resume = pendingRestore.current
    pendingRestore.current = null
    if (resume) {
      // currentTime is only settable once metadata has arrived.
      const seek = () => { element.currentTime = resume.audioTime }
      if (element.readyState >= 1) seek()
      else element.addEventListener('loadedmetadata', seek, { once: true })
    }

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
      onEndRef.current?.()
    }
    element.addEventListener('ended', onEnded)

    return () => {
      element.removeEventListener('loadedmetadata', onMetadata)
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
  // reset here rather than during render, where refs are off limits; the stored
  // restore position is consumed by the audio element and cleared there.
  useEffect(() => {
    liveIndexRef.current = 0
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
      cancelAnimationFrame(frameRef.current)
    }
  }, [chapter])

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

  const play = useCallback(() => {
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
      const time = Math.max(0, seconds)
      audio.currentTime = time
      setState((prev) => ({ ...prev, currentTime: time, ...positionAt(time) }))
    },
    [positionAt],
  )

  const seekToSentence = useCallback(
    (sentenceId: string) => {
      if (live) {
        const index = chapter?.sentences.findIndex((s) => s.id === sentenceId) ?? -1
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

  /** Resume at a stored position without starting playback. */
  const restore = useCallback(
    (sentenceId: string, audioTime: number) => {
      if (live) {
        const index = chapter?.sentences.findIndex((s) => s.id === sentenceId) ?? 0
        liveIndexRef.current = Math.max(0, index)
        setState((prev) => ({ ...prev, activeSentenceId: sentenceId }))
        return
      }
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = audioTime
      const position = positionAt(audioTime)
      setState((prev) => ({
        ...prev,
        currentTime: audioTime,
        ...position,
        activeSentenceId: position.activeSentenceId ?? sentenceId,
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
