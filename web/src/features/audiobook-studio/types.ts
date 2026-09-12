// Audiobook Studio domain types.
//
// The canonical artifact of a converted book is the sealed `.epub` zip. Chapter
// text and audio live in `staging` only while conversion is running; once the
// package is sealed they are dropped and the zip becomes the single source of
// truth, read back one entry at a time.

import type { Block, SentenceSpan } from './utils/sentences'
import type { TimedSentence } from './utils/timeline'

export type { Block, SentenceSpan, TimedSentence }

export type SourceType = 'epub' | 'epub3-narrated' | 'pdf' | 'txt' | 'md' | 'docx'

/** How a book is read aloud. `live` books have no stored audio and no export. */
export type BookMode = 'narrated' | 'live'

export type BookStatus =
  | 'parsing'
  | 'ready-to-narrate'
  | 'narrating'
  | 'sealing'
  | 'ready'
  | 'error'

export interface BookRecord {
  id: string
  title: string
  author: string
  language: string
  sourceName: string
  sourceType: SourceType
  mode: BookMode
  voiceId: string
  status: BookStatus
  chapterCount: number
  /** Total narration length in seconds; 0 until narration finishes. */
  durationSec: number
  /** True when the source was scanned and went through OCR — quality varies. */
  ocrUsed?: boolean
  coverBlob?: Blob
  createdAt: number
  updatedAt: number
  error?: string
}

/** The sealed publication. Kept out of `books` so listing the library is cheap. */
export interface ArtifactRecord {
  bookId: string
  epub: Uint8Array
  bytes: number
  sealedAt: number
}

/** Parsed chapter text. Staging lifetime — deleted once the book is sealed. */
export interface ChapterRecord {
  /** `${bookId}:${index}` */
  key: string
  bookId: string
  index: number
  title: string
  blocks: Block[]
  sentences: SentenceSpan[]
  /** Populated as narration completes; empty for `live` books. */
  timeline: TimedSentence[]
  durationSec: number
}

export type StagingKind = 'audio' | 'cover'

/** Binary chapter output held until the package is sealed. */
export interface StagingRecord {
  /** `${bookId}:${kind}:${index}` */
  key: string
  bookId: string
  kind: StagingKind
  index: number
  data: Uint8Array
  mime: string
}

/** Where the reader left off. The anchor is portable across layout changes. */
export interface ProgressRecord {
  bookId: string
  chapterIndex: number
  sentenceId: string
  audioTime: number
  updatedAt: number
}

export type JobStage = 'parse' | 'narrate' | 'seal' | 'done' | 'error'

/** Conversion checkpoint. Survives a reload so a job can resume mid-book. */
export interface JobRecord {
  bookId: string
  stage: JobStage
  /** Next chapter to narrate. Everything below this index is already in staging. */
  chapterCursor: number
  chapterCount: number
  /** Sentences narrated in the current chapter, for a finer progress bar. */
  sentenceCursor: number
  sentenceCount: number
  voiceId: string
  speed: number
  error?: string
  updatedAt: number
}

export interface SettingsRecord {
  key: 'default'
  voiceId: string
  speed: number
  playbackRate: number
  fontSizeRem: number
  autoFollow: boolean
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  key: 'default',
  voiceId: 'af_heart',
  speed: 1,
  playbackRate: 1,
  fontSizeRem: 1.0625,
  autoFollow: true,
}

/** Terminal states — a book in one of these is not being worked on. */
export function isSettled(status: BookStatus): boolean {
  return status === 'ready' || status === 'error' || status === 'ready-to-narrate'
}
