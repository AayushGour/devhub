// What a conversion must survive: an interruption, a chapter with nothing in
// it, a GPU that cannot hold the model, and its own progress reporting.
//
// Each of these costs hours or a whole book when it goes wrong, and none of
// them is reproducible by hand in under a few hundred megabytes of download —
// so the workers are faked and the engine is driven through its own messages.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StagingRecord } from '../types'

// ── stores the engine talks to ────────────────────────────────────

const books = new Map<string, Record<string, unknown>>()
const jobs = new Map<string, Record<string, unknown>>()
const chapters = new Map<string, Record<string, unknown>[]>()
const staging = new Map<string, StagingRecord>()
const artifacts = new Map<string, unknown>()

const putJob = vi.fn(async (job: { bookId: string }) => {
  jobs.set(job.bookId, job as Record<string, unknown>)
})
const putStaging = vi.fn(async (row: StagingRecord) => {
  staging.set(row.key, row)
})
const putChapter = vi.fn(async () => {})

vi.mock('./db', () => ({
  getArtifact: async (id: string) => artifacts.get(id),
  putArtifact: async (id: string, epub: Uint8Array) => { artifacts.set(id, epub) },
  deleteArtifact: async (id: string) => { artifacts.delete(id) },
  getBook: async (id: string) => books.get(id),
  putBook: async () => {},
  patchBook: async (id: string, patch: Record<string, unknown>) => {
    const next = { ...(books.get(id) ?? {}), ...patch }
    books.set(id, next)
    return next
  },
  listBooks: async () => [...books.values()],
  getJob: async (id: string) => jobs.get(id),
  putJob: (job: { bookId: string }) => putJob(job),
  deleteJob: async (id: string) => { jobs.delete(id) },
  listResumableJobs: async () => [...jobs.values()],
  listChapters: async (id: string) => chapters.get(id) ?? [],
  putChapter: () => putChapter(),
  putStaging: (row: StagingRecord) => putStaging(row),
  listStaging: async (id: string) => [...staging.values()].filter((row) => row.bookId === id),
  clearStaging: async () => {},
  deleteProgress: async () => {},
  getSettings: async () => ({}),
  estimateQuota: async () => ({ usage: 0, quota: 0, available: 0, persisted: true }),
  requestPersistence: async () => true,
  chapterKey: (b: string, i: number) => `${b}:${i}`,
  stagingKey: (b: string, k: string, i: number) => `${b}:${k}:${i}`,
}))

vi.mock('./bookSource', () => ({ clearBookCache: () => {}, loadOutline: async () => [] }))

let webgpuOk = false
const isWebGpuAvailable = vi.fn(async () => webgpuOk)
vi.mock('@/lib/webgpu', () => ({
  isWebGpuAvailable: (limits?: unknown) => isWebGpuAvailable(limits),
}))

// ── faked workers ─────────────────────────────────────────────────

interface Sent {
  type: string
  requestId: number
  [key: string]: unknown
}

/** Every message the engine sent to the narration worker, in order. */
const narrateSent: Sent[] = []
/** Devices whose model load should fail, as a real one can. */
const loadFailsOn = new Set<string>()
/** Sentences a faked chapter reports before it completes. */
let sentencesPerChapter = 1

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: (() => void) | null = null
  private kind: string

  constructor(url: URL) {
    const href = String(url)
    this.kind = href.includes('narrate') ? 'narrate' : href.includes('encode') ? 'encode' : 'seal'
  }

  postMessage(message: Sent): void {
    if (this.kind === 'encode') return this.reply({ type: 'encoded', chapterIndex: message.chapterIndex, mp3: new Uint8Array([1, 2, 3]), bytes: 3, encodeMs: 1 })
    if (this.kind === 'seal') return this.reply({ type: 'sealed', bookId: message.bookId, epub: new Uint8Array([1]), bytes: 1, sealMs: 1 })

    narrateSent.push(message)

    if (message.type === 'cancel') return
    if (message.type === 'load') {
      if (loadFailsOn.has(String(message.device))) {
        return this.reply({ type: 'error', requestId: message.requestId, message: `no ${message.device} device` })
      }
      this.reply({ type: 'status', label: 'ready' })
      return this.reply({
        type: 'ready',
        requestId: message.requestId,
        device: message.device,
        dtype: message.dtype,
        loadMs: 0,
        webgpuAvailable: true,
      })
    }
    if (message.type === 'narrate') {
      for (let i = 1; i <= sentencesPerChapter; i++) {
        this.reply({ type: 'sentence', chapterIndex: message.chapterIndex, index: i, total: sentencesPerChapter, audioSec: i, generateMs: 1 })
      }
      return this.reply({
        type: 'chapter',
        requestId: message.requestId,
        chapterIndex: message.chapterIndex,
        pcm: new Float32Array(8),
        sampleRate: 24000,
        timeline: [],
        stats: { chars: 1, sentences: sentencesPerChapter, audioSec: 1, generateMs: 1, charsPerSec: 1, realtimeFactor: 1 },
      })
    }
  }

  terminate(): void {}

  /** Workers answer asynchronously; replying inline would hide ordering bugs. */
  private reply(data: unknown): void {
    queueMicrotask(() => this.onmessage?.({ data } as MessageEvent))
  }
}

// ── fixtures ──────────────────────────────────────────────────────

const BOOK = 'b1'

function sentence(id: string) {
  return { id, blockIdx: 0, blockType: 'p' as const, text: 'A line.', chunks: ['A line.'], endsBlock: true }
}

/** `sentenceCounts[i]` sentences in chapter i — 0 for a chapter with no prose. */
function seedBook(sentenceCounts: number[]): void {
  books.set(BOOK, { id: BOOK, title: 'Salt', status: 'ready-to-narrate', mode: 'narrated', voiceId: 'af_heart', language: 'en', author: 'A' })
  chapters.set(
    BOOK,
    sentenceCounts.map((count, index) => ({
      key: `${BOOK}:${index}`,
      bookId: BOOK,
      index,
      title: `Chapter ${index + 1}`,
      blocks: [],
      sentences: Array.from({ length: count }, (_, i) => sentence(`s${index}-${i}`)),
      timeline: [],
      durationSec: 0,
    })),
  )
}

/** Pretend chapter `index` was narrated by a previous run. */
function seedStagedAudio(index: number): void {
  staging.set(`${BOOK}:audio:${index}`, {
    key: `${BOOK}:audio:${index}`,
    bookId: BOOK,
    kind: 'audio',
    index,
    data: new Uint8Array([1]),
    mime: 'audio/mpeg',
  })
}

const narrated = () =>
  narrateSent.filter((m) => m.type === 'narrate').map((m) => m.chapterIndex as number)

const loads = () =>
  narrateSent.filter((m) => m.type === 'load').map((m) => `${m.device}/${m.dtype}`)

beforeEach(() => {
  books.clear(); jobs.clear(); chapters.clear(); staging.clear(); artifacts.clear()
  narrateSent.length = 0
  loadFailsOn.clear()
  sentencesPerChapter = 1
  webgpuOk = false
  putJob.mockClear(); putStaging.mockClear(); putChapter.mockClear()
  isWebGpuAvailable.mockClear()
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resuming an interrupted conversion', () => {
  it('picks up from the audio that exists, not from the job stage', async () => {
    // The job stage is whatever the interruption left behind — here a failure
    // partway through, which is exactly when the cursor used to reset to 0 and
    // re-narrate the entire book over audio already sitting in staging.
    seedBook([1, 1, 1, 1])
    seedStagedAudio(0)
    seedStagedAudio(1)
    jobs.set(BOOK, { bookId: BOOK, stage: 'error', chapterCursor: 0, chapterCount: 4, sentenceCursor: 0, sentenceCount: 0, voiceId: 'af_heart', speed: 1 })

    const { startNarration } = await import('./conversionEngine')
    await startNarration(BOOK, 'af_heart', 1)

    expect(narrated()).toEqual([2, 3])
    expect(books.get(BOOK)?.status).toBe('ready')
  })

  it('does not re-narrate a book whose chapters are all staged', async () => {
    seedBook([1, 1])
    seedStagedAudio(0)
    seedStagedAudio(1)

    const { startNarration } = await import('./conversionEngine')
    await startNarration(BOOK, 'af_heart', 1)

    expect(narrated()).toEqual([])
    expect(books.get(BOOK)?.status).toBe('ready')
  })
})

describe('chapters with no prose', () => {
  it('records an empty chapter instead of dropping it out of the book', async () => {
    // Chapter 1 has nothing to say. Skipping it silently would leave the sealed
    // book one chapter short and shift every index after it.
    seedBook([1, 0, 1])

    const { startNarration } = await import('./conversionEngine')
    await startNarration(BOOK, 'af_heart', 1)

    expect(narrated()).toEqual([0, 2])

    const indices = [...staging.values()].filter((row) => row.kind === 'audio').map((row) => row.index).sort()
    expect(indices).toEqual([0, 1, 2])
    // Present, but with no audio and no timings to its name.
    expect(staging.get(`${BOOK}:audio:1`)?.data.length).toBe(0)
  })

  it('resumes past an empty chapter rather than stopping on it', async () => {
    seedBook([1, 0, 1])
    seedStagedAudio(0)
    staging.set(`${BOOK}:audio:1`, { key: `${BOOK}:audio:1`, bookId: BOOK, kind: 'audio', index: 1, data: new Uint8Array(0), mime: 'audio/mpeg' })

    const { startNarration } = await import('./conversionEngine')
    await startNarration(BOOK, 'af_heart', 1)

    expect(narrated()).toEqual([2])
  })
})

describe('sentence progress', () => {
  it('keeps the store current without a database write per sentence', async () => {
    seedBook([1])
    sentencesPerChapter = 40

    const { startNarration } = await import('./conversionEngine')
    const { useAudiobookStore } = await import('../store/audiobookStore')

    const seen: number[] = []
    const unsubscribe = useAudiobookStore.subscribe((state) => {
      const job = state.jobs[BOOK]
      if (job) seen.push(job.sentenceCursor)
    })

    await startNarration(BOOK, 'af_heart', 1)
    unsubscribe()

    // Every sentence moves the progress bar...
    expect(seen.filter((n) => n > 0)).toHaveLength(40)
    // ...but the writes are the two checkpoints that matter, not forty-two.
    // (start of the chapter, and after its audio is durable)
    expect(putJob.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

describe('choosing a device for the model', () => {
  it('asks whether WebGPU can hold this model, not merely whether it exists', async () => {
    webgpuOk = true

    const { ensureModel } = await import('./conversionEngine')
    await ensureModel()

    const [limits] = isWebGpuAvailable.mock.calls[0] as [Record<string, number>]
    expect(limits?.maxStorageBufferBindingSize).toBeGreaterThan(128 * 1024 * 1024)
    expect(limits?.maxBufferSize).toBeGreaterThanOrEqual(326 * 1024 * 1024)
  })

  it('falls back to WASM when the WebGPU load fails', async () => {
    webgpuOk = true
    loadFailsOn.add('webgpu')

    const { ensureModel, onModelError } = await import('./conversionEngine')
    const failures: string[] = []
    onModelError((message) => failures.push(message))

    await expect(ensureModel()).resolves.toBe('wasm')
    // Kokoro is corrupted by anything but fp32 on WebGPU, and fp32 is far too
    // heavy for WASM — so the dtype has to move with the device.
    expect(loads()).toEqual(['webgpu/fp32', 'wasm/q8'])
    // A fallback that worked is not a failure anyone needs to be told about.
    expect(failures).toEqual([])
  })

  it('narrates a whole book through the fallback device', async () => {
    webgpuOk = true
    loadFailsOn.add('webgpu')
    seedBook([1, 1])

    const { startNarration } = await import('./conversionEngine')
    await startNarration(BOOK, 'af_heart', 1)

    expect(books.get(BOOK)?.status).toBe('ready')
    // The failed device is not tried again for every chapter.
    expect(loads().filter((load) => load.startsWith('webgpu'))).toHaveLength(1)
  })

  it('reports a load that cannot be completed at all', async () => {
    // Offline: neither device can fetch the weights. Nothing else in the app
    // hears about this, so the overlay would sit there forever.
    loadFailsOn.add('webgpu')
    loadFailsOn.add('wasm')

    const { ensureModel, onModelError } = await import('./conversionEngine')
    const failures: string[] = []
    onModelError((message) => failures.push(message))

    await expect(ensureModel()).rejects.toThrow(/no wasm device/)
    expect(failures).toEqual(['no wasm device'])
  })
})
