// Conversion orchestrator.
//
// A module-level singleton, deliberately NOT a React hook: a conversion runs
// for minutes to hours, and navigating to another studio must not kill it.
// React components subscribe to its effects through the zustand store.
//
// Durability model: chapters are narrated one at a time and each result is
// written to `staging` with a job checkpoint. A closed tab loses at most the
// chapter in flight. Only when the last chapter lands is the package sealed —
// and the artifact is stored BEFORE staging is cleared, so there is never a
// moment when the audio exists nowhere.

import { createLogger } from '@/lib/logger'
import { isWebGpuAvailable } from '@/lib/webgpu'
import * as db from './db'
import { buildSentences } from './sentences'
import { chapterId } from './epubWrite'
import type { ChapterInput } from './epubWrite'
import { useAudiobookStore } from '../store/audiobookStore'
import type { BookMode, BookRecord, JobRecord, SourceType } from '../types'
import type { ParsedBook } from './epubRead'
import type { ParseRequest, ParseResponse } from '../workers/parse.worker'
import type {
  Device,
  Dtype,
  NarrateCommand,
  NarrateRequest,
  NarrateResponse,
  NarrateResult,
} from '../workers/narrate.worker'
import type { EncodeError, EncodeRequest, EncodeResponse } from '../workers/encode.worker'
import type { SealRequest, SealResponse } from '../workers/seal.worker'

const log = createLogger('audiobook:engine')

const MP3_KBPS = 48

/** Exactly one dtype is correct per device — see the narrate worker's guard. */
const DTYPE_FOR_DEVICE: Record<Device, Dtype> = { webgpu: 'fp32', wasm: 'q8' }

export interface ImportOptions {
  mode: BookMode
  voiceId: string
  speed: number
}

// ── worker plumbing ───────────────────────────────────────────────

let parseWorker: Worker | null = null
let narrateWorker: Worker | null = null
let encodeWorker: Worker | null = null
let sealWorker: Worker | null = null

/** Resolvers for in-flight requests, keyed by the response `type` awaited. */
type Waiter<T> = { resolve: (value: T) => void; reject: (reason: Error) => void }

const parseWaiters = new Map<string, Waiter<ParseResponse>>()

/**
 * Keyed by request id rather than held in a single slot: a voice preview and a
 * running conversion share this worker, and matching on response type alone
 * would let one settle the other's promise and strand the book.
 */
const narrateWaiters = new Map<number, Waiter<NarrateResult> & { want: NarrateResult['type'] }>()
let nextRequestId = 1
let encodeWaiter: Waiter<EncodeResponse> | null = null
let sealWaiter: Waiter<SealResponse> | null = null

function getParseWorker(): Worker {
  if (parseWorker) return parseWorker
  parseWorker = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
    type: 'module',
  })
  parseWorker.onmessage = (event: MessageEvent<ParseResponse>) => {
    const message = event.data
    if (message.type === 'status') {
      log.log(`[${message.bookId}] ${message.label}`)
      return
    }
    const waiter = parseWaiters.get(message.bookId)
    parseWaiters.delete(message.bookId)
    if (!waiter) return
    if (message.type === 'error') waiter.reject(new Error(message.message))
    else waiter.resolve(message)
  }
  return parseWorker
}

function getNarrateWorker(): Worker {
  if (narrateWorker) return narrateWorker
  narrateWorker = new Worker(new URL('../workers/narrate.worker.ts', import.meta.url), {
    type: 'module',
  })
  narrateWorker.onmessage = (event: MessageEvent<NarrateResponse>) => {
    const message = event.data

    if (message.type === 'status') {
      modelStatusListeners.forEach((listener) => listener(message.label, message.progress))
      return
    }
    if (message.type === 'sentence') {
      onSentenceProgress?.(message.chapterIndex, message.index, message.total)
      return
    }
    const waiter = narrateWaiters.get(message.requestId)
    if (!waiter) return
    narrateWaiters.delete(message.requestId)

    if (message.type === 'error') waiter.reject(new Error(message.message))
    else if (waiter.want === message.type) waiter.resolve(message)
    else waiter.reject(new Error(`expected ${waiter.want}, received ${message.type}`))
  }
  narrateWorker.onerror = (event) => {
    // A crash takes down everything in flight, not just the newest request.
    const reason = new Error(event.message || 'narration worker crashed')
    for (const waiter of narrateWaiters.values()) waiter.reject(reason)
    narrateWaiters.clear()
  }
  return narrateWorker
}

function getEncodeWorker(): Worker {
  if (encodeWorker) return encodeWorker
  encodeWorker = new Worker(new URL('../workers/encode.worker.ts', import.meta.url), {
    type: 'module',
  })
  encodeWorker.onmessage = (event: MessageEvent<EncodeResponse | EncodeError>) => {
    const message = event.data
    if (message.type === 'error') encodeWaiter?.reject(new Error(message.message))
    else encodeWaiter?.resolve(message)
    encodeWaiter = null
  }
  return encodeWorker
}

function getSealWorker(): Worker {
  if (sealWorker) return sealWorker
  sealWorker = new Worker(new URL('../workers/seal.worker.ts', import.meta.url), {
    type: 'module',
  })
  sealWorker.onmessage = (event: MessageEvent<SealResponse>) => {
    const message = event.data
    if (message.type === 'error') sealWaiter?.reject(new Error(message.message))
    else sealWaiter?.resolve(message)
    sealWaiter = null
  }
  return sealWorker
}

// ── observers ─────────────────────────────────────────────────────

type ModelStatusListener = (label: string, progress?: number) => void
const modelStatusListeners = new Set<ModelStatusListener>()

/** Subscribe to model download/load progress. Returns an unsubscribe function. */
export function onModelStatus(listener: ModelStatusListener): () => void {
  modelStatusListeners.add(listener)
  return () => modelStatusListeners.delete(listener)
}

let onSentenceProgress: ((chapter: number, done: number, total: number) => void) | null = null

// ── state ─────────────────────────────────────────────────────────

const cancelled = new Set<string>()
let running: Promise<void> = Promise.resolve()

function store() {
  return useAudiobookStore.getState()
}

/** Serialise conversions — one book narrating at a time, one GPU, one model. */
function enqueue(task: () => Promise<void>): Promise<void> {
  running = running.then(task, task)
  return running
}

async function publishBook(bookId: string, patch: Partial<BookRecord>): Promise<void> {
  const next = await db.patchBook(bookId, patch)
  if (next) store().upsertBook(next)
}

async function publishJob(job: Omit<JobRecord, 'updatedAt'>): Promise<void> {
  await db.putJob(job)
  store().setJob({ ...job, updatedAt: Date.now() })
}

// ── import ────────────────────────────────────────────────────────

function requestParse(request: ParseRequest): Promise<ParseResponse> {
  return new Promise((resolve, reject) => {
    parseWaiters.set(request.bookId, { resolve, reject })
    getParseWorker().postMessage(request, [request.bytes.buffer])
  })
}

/**
 * Read a file into the library. Narration is queued separately so the book
 * becomes visible — and its text readable — before any audio exists.
 */
/** Audio type suffixes an EPUB 3 overlay may reference. */
export async function importFile(file: File, options: ImportOptions): Promise<string> {
  const bookId = crypto.randomUUID()
  const now = Date.now()

  const book: BookRecord = {
    id: bookId,
    title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(),
    author: 'Unknown',
    language: 'en',
    sourceName: file.name,
    sourceType: 'txt',
    mode: options.mode,
    voiceId: options.voiceId,
    status: 'parsing',
    chapterCount: 0,
    durationSec: 0,
    createdAt: now,
    updatedAt: now,
  }

  await db.putBook(book)
  store().upsertBook(book)
  store().setActiveBook(bookId)

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // Keep a copy: a source that already carries overlays becomes the artifact
    // verbatim, so it must survive the transfer to the parse worker.
    const original = file.name.toLowerCase().endsWith('.epub') ? bytes.slice() : null

    const response = await requestParse({ bookId, fileName: file.name, bytes })
    if (response.type !== 'parsed') throw new Error('parser returned no book')

    if (response.sourceType === 'epub3-narrated' && original) {
      await adoptNarratedEpub(bookId, response.book, original)
      return bookId
    }

    await storeParsedBook(bookId, response.book, response.sourceType, options, response.ocrUsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error(`[${bookId}] parse failed:`, message)
    await publishBook(bookId, { status: 'error', error: message })
  }

  return bookId
}

async function storeParsedBook(
  bookId: string,
  parsed: ParsedBook,
  sourceType: SourceType,
  options: ImportOptions,
  ocrUsed = false,
): Promise<void> {
  for (let i = 0; i < parsed.chapters.length; i++) {
    const chapter = parsed.chapters[i]
    await db.putChapter({
      key: db.chapterKey(bookId, i),
      bookId,
      index: i,
      title: chapter.title,
      blocks: chapter.blocks,
      sentences: buildSentences(chapter.blocks, parsed.language),
      timeline: [],
      durationSec: 0,
    })
  }

  if (parsed.cover) {
    await db.putStaging({
      key: db.stagingKey(bookId, 'cover', 0),
      bookId,
      kind: 'cover',
      index: 0,
      data: parsed.cover.bytes,
      mime: parsed.cover.mime,
    })
  }

  // A live book is readable the moment it is parsed — there is no audio to make.
  const status = options.mode === 'live' ? 'ready' : 'ready-to-narrate'

  await publishBook(bookId, {
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    sourceType,
    ocrUsed,
    chapterCount: parsed.chapters.length,
    status,
    coverBlob: parsed.cover
      ? new Blob([parsed.cover.bytes as unknown as BlobPart], { type: parsed.cover.mime })
      : undefined,
  })

  if (options.mode === 'narrated') {
    void startNarration(bookId, options.voiceId, options.speed)
  }
}

/**
 * Register a book that arrived already narrated.
 *
 * Nothing is generated and nothing is re-sealed — the uploaded file becomes the
 * artifact as-is, and the manifest's own asset paths are stored so the reader
 * can find chapters that do not follow our naming. Re-narrating a book that
 * already has audio would waste hours and lose the original narrator.
 */
async function adoptNarratedEpub(
  bookId: string,
  parsed: ParsedBook,
  epub: Uint8Array,
): Promise<void> {
  await db.putArtifact(bookId, epub)

  const overlays = parsed.overlays ?? []
  await publishBook(bookId, {
    title: parsed.title,
    author: parsed.author,
    language: parsed.language,
    sourceType: 'epub3-narrated',
    mode: 'narrated',
    chapterCount: Math.min(parsed.chapters.length, overlays.length || parsed.chapters.length),
    overlays,
    status: 'ready',
    coverBlob: parsed.cover
      ? new Blob([parsed.cover.bytes as unknown as BlobPart], { type: parsed.cover.mime })
      : undefined,
  })

  // Duration comes from the overlays themselves, read back through the same
  // path the reader uses — no second parser to keep in step.
  const { loadOutline } = await import('./bookSource')
  const record = await db.getBook(bookId)
  if (!record) return

  const outline = await loadOutline(record)
  await publishBook(bookId, {
    chapterCount: outline.length,
    durationSec: outline.reduce((sum, entry) => sum + entry.durationSec, 0),
  })

  log.log(`[${bookId}] adopted a narrated EPUB — ${outline.length} chapters`)
}

// ── narration ─────────────────────────────────────────────────────

function requestNarrate<T extends NarrateResult['type']>(
  request: NarrateCommand,
  want: T,
): Promise<Extract<NarrateResult, { type: T }>> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++
    narrateWaiters.set(requestId, {
      resolve: resolve as (value: NarrateResult) => void,
      reject,
      want,
    })
    getNarrateWorker().postMessage({ ...request, requestId } as NarrateRequest)
  })
}

function requestEncode(request: EncodeRequest): Promise<EncodeResponse> {
  return new Promise((resolve, reject) => {
    encodeWaiter = { resolve, reject }
    getEncodeWorker().postMessage(request, [request.pcm.buffer])
  })
}

async function resolveDevice(): Promise<Device> {
  return (await isWebGpuAvailable()) ? 'webgpu' : 'wasm'
}

/** Load the model if it is not already resident. Cheap when it is. */
export async function ensureModel(): Promise<Device> {
  const device = await resolveDevice()
  await requestNarrate({ type: 'load', dtype: DTYPE_FOR_DEVICE[device], device }, 'ready')
  return device
}

/** Synthesise one sample sentence, for the voice picker's preview. */
export async function previewVoice(
  voiceId: string,
  text: string,
  speed = 1,
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  await ensureModel()
  const response = await requestNarrate({ type: 'sample', voice: voiceId, text, speed }, 'sample')
  return { pcm: response.pcm, sampleRate: response.sampleRate }
}

export function cancelNarration(bookId: string): void {
  cancelled.add(bookId)
}

export function startNarration(bookId: string, voiceId: string, speed: number): Promise<void> {
  return enqueue(() => narrateBook(bookId, voiceId, speed))
}

async function narrateBook(bookId: string, voiceId: string, speed: number): Promise<void> {
  cancelled.delete(bookId)

  const book = await db.getBook(bookId)
  if (!book) return

  const chapters = await db.listChapters(bookId)
  if (chapters.length === 0) {
    await publishBook(bookId, { status: 'error', error: 'No chapters to narrate.' })
    return
  }

  // Resume where a previous run stopped, if it left a checkpoint.
  const existing = await db.getJob(bookId)
  let cursor = existing?.stage === 'narrate' ? existing.chapterCursor : 0

  await publishBook(bookId, { status: 'narrating', voiceId })
  await publishJob({
    bookId,
    stage: 'narrate',
    chapterCursor: cursor,
    chapterCount: chapters.length,
    sentenceCursor: 0,
    sentenceCount: chapters[cursor]?.sentences.length ?? 0,
    voiceId,
    speed,
  })

  try {
    await ensureModel()

    for (; cursor < chapters.length; cursor++) {
      if (cancelled.has(bookId)) {
        log.log(`[${bookId}] narration cancelled at chapter ${cursor}`)
        await publishBook(bookId, { status: 'ready-to-narrate' })
        return
      }

      const chapter = chapters[cursor]
      if (chapter.sentences.length === 0) continue

      onSentenceProgress = (chapterIndex, done, total) => {
        void publishJob({
          bookId,
          stage: 'narrate',
          chapterCursor: chapterIndex,
          chapterCount: chapters.length,
          sentenceCursor: done,
          sentenceCount: total,
          voiceId,
          speed,
        })
      }

      const narrated = await requestNarrate(
        {
          type: 'narrate',
          chapterIndex: cursor,
          voice: voiceId,
          speed,
          sentences: chapter.sentences,
        },
        'chapter',
      )

      const encoded = await requestEncode({
        chapterIndex: cursor,
        pcm: narrated.pcm,
        sampleRate: narrated.sampleRate,
        kbps: MP3_KBPS,
      })

      await db.putStaging({
        key: db.stagingKey(bookId, 'audio', cursor),
        bookId,
        kind: 'audio',
        index: cursor,
        data: encoded.mp3,
        mime: 'audio/mpeg',
      })

      await db.putChapter({
        ...chapter,
        timeline: narrated.timeline,
        durationSec: narrated.stats.audioSec,
      })

      // Checkpoint AFTER the audio is durable, so a crash re-runs at most this
      // chapter rather than skipping it.
      await publishJob({
        bookId,
        stage: 'narrate',
        chapterCursor: cursor + 1,
        chapterCount: chapters.length,
        sentenceCursor: 0,
        sentenceCount: chapters[cursor + 1]?.sentences.length ?? 0,
        voiceId,
        speed,
      })

      // The chapter is readable now — this is what makes reading possible while
      // the rest of the book is still converting.
      const partial = await db.getBook(bookId)
      if (partial) store().upsertBook(partial)
    }

    onSentenceProgress = null
    await sealBook(bookId)
  } catch (err) {
    onSentenceProgress = null
    const message = err instanceof Error ? err.message : String(err)
    log.error(`[${bookId}] narration failed:`, message)
    await publishBook(bookId, { status: 'error', error: message })
    await publishJob({
      bookId,
      stage: 'error',
      chapterCursor: cursor,
      chapterCount: chapters.length,
      sentenceCursor: 0,
      sentenceCount: 0,
      voiceId,
      speed,
      error: message,
    })
  }
}

// ── sealing ───────────────────────────────────────────────────────

function requestSeal(request: SealRequest): Promise<SealResponse> {
  return new Promise((resolve, reject) => {
    sealWaiter = { resolve, reject }
    getSealWorker().postMessage(request)
  })
}

async function sealBook(bookId: string): Promise<void> {
  const book = await db.getBook(bookId)
  if (!book) return

  await publishBook(bookId, { status: 'sealing' })

  const chapters = await db.listChapters(bookId)
  const staging = await db.listStaging(bookId)
  const audioByIndex = new Map(
    staging.filter((row) => row.kind === 'audio').map((row) => [row.index, row.data]),
  )

  const inputs: ChapterInput[] = chapters
    .filter((chapter) => audioByIndex.has(chapter.index))
    .map((chapter) => ({
      index: chapter.index + 1, // chNNN is 1-based in the package
      title: chapter.title,
      blocks: chapter.blocks,
      sentences: chapter.sentences,
      timeline: chapter.timeline,
      durationSec: chapter.durationSec,
    }))

  if (inputs.length === 0) throw new Error('nothing to seal — no narrated chapters')

  const audio: [number, Uint8Array][] = inputs.map((input) => [
    input.index,
    audioByIndex.get(input.index - 1)!,
  ])

  const response = await requestSeal({
    bookId,
    meta: {
      identifier: `urn:uuid:${bookId}`,
      title: book.title,
      author: book.author,
      language: book.language,
    },
    chapters: inputs,
    audio,
    modified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  })
  if (response.type !== 'sealed') throw new Error('sealing produced no archive')

  // Order matters: the artifact must exist before staging is dropped.
  await db.putArtifact(bookId, response.epub)
  await db.clearStaging(bookId)
  await db.deleteJob(bookId)
  store().clearJob(bookId)

  const durationSec = inputs.reduce((sum, input) => sum + input.durationSec, 0)
  await publishBook(bookId, { status: 'ready', durationSec })

  log.log(`[${bookId}] sealed ${chapterId(inputs.length)} chapters, ${response.bytes} bytes`)
}

// ── recovery ──────────────────────────────────────────────────────

/** Re-queue anything a closed tab or crash left mid-conversion. */
export async function resumeInterrupted(): Promise<void> {
  const jobs = await db.listResumableJobs()
  for (const job of jobs) {
    const book = await db.getBook(job.bookId)
    if (!book || book.status === 'ready') continue
    log.log(`[${job.bookId}] resuming at chapter ${job.chapterCursor}`)
    void startNarration(job.bookId, job.voiceId, job.speed)
  }
}
