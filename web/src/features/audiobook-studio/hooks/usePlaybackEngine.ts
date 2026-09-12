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
import { findSentenceAt, tokenizeWords, wordSpanAt, type WordSpan } from '../utils/timeline'
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

interface Options {
  mode: BookMode
  chapter: ReadableChapter | null
  audioUrl: string | null
  rate: number
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

export function usePlaybackEngine({ mode, chapter, audioUrl, rate, onChapterEnd }: Options) {
  const [state, setState] = useState<PlaybackState>(IDLE)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const frameRef = useRef(0)
  const liveIndexRef = useRef(0)
  const onEndRef = useRef(onChapterEnd)

  // Written in an effect rather than during render — a ref is not readable or
  // writable while rendering.
  useEffect(() => {
    onEndRef.current = onChapterEnd
  }, [onChapterEnd])

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

  const track = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current
      if (audio && timeline.length > 0) {
        const index = findSentenceAt(timeline, audio.currentTime)
        const entry = index >= 0 ? timeline[index] : null
        setState((prev) => ({
          ...prev,
          currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration) ? audio.duration : prev.duration,
          activeIndex: index,
          activeSentenceId: entry?.id ?? null,
          wordRange: entry
            ? wordSpanAt(entry, audio.currentTime, wordsBySentence.get(entry.id))
            : null,
        }))
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)
  }, [timeline, wordsBySentence])

  // Build the element for the current chapter. Recreated per chapter so seeking
  // and duration always refer to the audio actually on screen.
  useEffect(() => {
    if (live || !audioUrl) return

    const audio = new Audio(audioUrl)
    audio.preload = 'metadata'
    audio.playbackRate = rate
    audioRef.current = audio

    const onEnded = () => {
      cancelAnimationFrame(frameRef.current)
      setState((prev) => ({ ...prev, playing: false }))
      onEndRef.current?.()
    }
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.pause()
      cancelAnimationFrame(frameRef.current)
      audioRef.current = null
    }
    // `rate` is applied separately so changing speed does not rebuild the element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, live])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  // Stop any speech when the chapter changes or the component unmounts —
  // speechSynthesis is global and outlives React otherwise.
  useEffect(() => {
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

  const toggle = useCallback(() => {
    setState((prev) => {
      if (prev.playing) pause()
      else play()
      return prev
    })
  }, [pause, play])

  const seekTo = useCallback(
    (seconds: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = Math.max(0, seconds)
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }))
    },
    [],
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
      const index = findSentenceAt(timeline, audioTime)
      setState((prev) => ({
        ...prev,
        currentTime: audioTime,
        activeIndex: index,
        activeSentenceId: index >= 0 ? timeline[index].id : sentenceId,
      }))
    },
    [chapter, live, timeline],
  )

  return { state: { ...state, live }, play, pause, toggle, seekTo, seekToSentence, restore }
}
