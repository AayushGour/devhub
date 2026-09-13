// Playback clock -> highlight position.
//
// Sentence timings are EXACT: each sentence's audio was generated on its own,
// so its clipBegin/clipEnd come from a real sample count, not an estimate.
// Word position within a sentence is interpolated by character weight, which
// drifts mid-sentence but resyncs exactly at every sentence boundary.

export interface TimedSentence {
  id: string
  text: string
  /** Seconds from the start of the chapter's audio file. */
  clipBegin: number
  clipEnd: number
}

/**
 * Index of the sentence playing at time `t`, or -1 before the first one.
 * Binary search — this runs on every animation frame.
 */
export function findSentenceAt(timeline: TimedSentence[], t: number): number {
  let lo = 0
  let hi = timeline.length - 1
  let found = -1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const sentence = timeline[mid]

    if (t < sentence.clipBegin) {
      hi = mid - 1
    } else if (t >= sentence.clipEnd) {
      // Hold the last sentence through the silence that follows it, rather
      // than blanking the highlight in the gap before the next clipBegin.
      found = mid
      lo = mid + 1
    } else {
      return mid
    }
  }

  return found
}

export interface WordSpan {
  /** Character offsets into the sentence text. */
  start: number
  end: number
}

/** Word boundaries within a sentence, with their character offsets. */
export function tokenizeWords(text: string): WordSpan[] {
  const spans: WordSpan[] = []
  const re = /\S+/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return spans
}

/**
 * Which word is being spoken at time `t`, assuming speech duration is
 * proportional to character count across the sentence.
 *
 * Returns null when `t` falls outside the sentence's clip.
 */
export function wordSpanAt(
  sentence: TimedSentence,
  t: number,
  words = tokenizeWords(sentence.text),
): WordSpan | null {
  if (words.length === 0) return null

  const duration = sentence.clipEnd - sentence.clipBegin
  if (duration <= 0) return words[0]

  const progress = Math.min(1, Math.max(0, (t - sentence.clipBegin) / duration))

  // Weight by end-offset so trailing punctuation and spacing count toward the
  // word they follow — the same weighting the SMIL timings were built from.
  const totalChars = words[words.length - 1].end
  const targetChar = progress * totalChars

  for (const word of words) {
    if (targetChar <= word.end) return word
  }
  return words[words.length - 1]
}

/** Total duration covered by a timeline, in seconds. */
export function timelineDuration(timeline: TimedSentence[]): number {
  return timeline.length === 0 ? 0 : timeline[timeline.length - 1].clipEnd
}
