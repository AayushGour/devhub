// Sentence segmentation for narration.
//
// Two jobs, deliberately separate:
//  1. Split prose into sentences — the unit of SMIL <par> sync, so a bad split
//     is directly visible as a mistimed highlight.
//  2. Sub-split any sentence too long for the TTS model's phoneme window.
//     Sub-chunks are synthesised separately but stay ONE sentence for sync:
//     the sentence's clipEnd is the end of its last chunk.

/** Kokoro's phoneme context is ~510 tokens. Chars are a cheap, safe proxy. */
export const MAX_CHUNK_CHARS = 400

/** Segments this short are punctuation debris, not sentences. */
const MIN_SENTENCE_CHARS = 3

// ICU sentence-breaking splits after any period, so titles and initials
// ("Dr. Smith", "J. R. R. Tolkien") produce spurious breaks. Re-joining on a
// trailing abbreviation is far cheaper than a full NLP pass and covers the
// cases that actually appear in books.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'rev', 'hon', 'pres',
  'gen', 'col', 'lt', 'sgt', 'capt', 'cmdr', 'adm', 'gov', 'sen', 'rep',
  'vs', 'etc', 'ie', 'eg', 'cf', 'al', 'ca', 'approx', 'fig', 'no', 'vol',
  'ch', 'ed', 'pp', 'op', 'cit', 'ibid', 'viz', 'esp',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'inc', 'ltd', 'co', 'corp', 'univ', 'dept', 'est',
])

/** True when `text` ends in something that is not really a sentence end. */
function endsMidSentence(text: string): boolean {
  const trimmed = text.trimEnd()
  if (!trimmed.endsWith('.')) return false

  const lastWord = trimmed.slice(0, -1).split(/[\s(["']+/).pop() ?? ''

  // A single letter before the period is an initial: "J." in "J. R. R. Tolkien".
  if (/^[A-Za-z]$/.test(lastWord)) return true

  return ABBREVIATIONS.has(lastWord.toLowerCase())
}

/**
 * Split prose into sentences. Uses Intl.Segmenter (no dependency, ICU-backed)
 * with abbreviation and short-fragment repair on top.
 */
export function splitSentences(text: string, locale = 'en'): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  let raw: string[]
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
    raw = [...segmenter.segment(normalized)].map((s) => s.segment)
  } else {
    // jsdom and older engines have no Segmenter. Good enough to keep tests and
    // legacy browsers running; the repair pass below cleans up after it.
    raw = normalized.split(/(?<=[.!?])\s+/)
  }

  const out: string[] = []
  for (const segment of raw) {
    const sentence = segment.trim()
    if (!sentence) continue

    const previous = out[out.length - 1]
    const tooShort = sentence.length < MIN_SENTENCE_CHARS
    if (previous !== undefined && (tooShort || endsMidSentence(previous))) {
      out[out.length - 1] = `${previous} ${sentence}`
      continue
    }
    out.push(sentence)
  }
  return out
}

/**
 * Break a sentence into TTS-sized chunks, preferring the least disruptive
 * boundary available: semicolons, then commas, then any whitespace.
 */
export function subSplit(sentence: string, maxChars = MAX_CHUNK_CHARS): string[] {
  if (sentence.length <= maxChars) return [sentence]

  const pieces: string[] = []
  let rest = sentence

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars)
    const cut =
      window.lastIndexOf('; ') + 1 ||
      window.lastIndexOf(', ') + 1 ||
      window.lastIndexOf(' ') ||
      maxChars

    // No usable boundary in the whole window — hard-cut rather than loop forever.
    const at = cut > 0 ? cut : maxChars
    pieces.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }

  if (rest) pieces.push(rest)
  return pieces.filter(Boolean)
}

export interface Block {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'list'
  text: string
}

export interface SentenceSpan {
  /** Stable id — becomes the XHTML span id and the SMIL <text> fragment. */
  id: string
  blockIdx: number
  blockType: Block['type']
  text: string
  /** TTS input units. Length > 1 only for sentences past MAX_CHUNK_CHARS. */
  chunks: string[]
  /** True for the last sentence of its block — drives inter-sentence silence. */
  endsBlock: boolean
}

/** Flatten blocks into the narration/sync unit list. */
export function buildSentences(blocks: Block[], locale = 'en'): SentenceSpan[] {
  const spans: SentenceSpan[] = []
  let n = 0

  blocks.forEach((block, blockIdx) => {
    const sentences = splitSentences(block.text, locale)
    sentences.forEach((text, i) => {
      n += 1
      spans.push({
        id: `s${n}`,
        blockIdx,
        blockType: block.type,
        text,
        chunks: subSplit(text),
        endsBlock: i === sentences.length - 1,
      })
    })
  })

  return spans
}
