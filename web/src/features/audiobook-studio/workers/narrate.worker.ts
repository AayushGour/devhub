// Narration worker.
//
// Synthesises one chapter at a time so the engine can checkpoint between them:
// a closed tab loses at most the chapter in flight.
//
// Sentence timings are exact rather than estimated. Each sentence is generated
// on its own, so its duration is a real sample count and the running offset
// across the chapter accumulates no drift. That is what lets the SMIL overlay
// carry true clipBegin/clipEnd values without a forced-alignment pass.

import { KokoroTTS } from 'kokoro-js'
import type { SentenceSpan } from '../utils/sentences'
import type { TimedSentence } from '../utils/timeline'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

/** kokoro-js types the voice as a union of its own ids, not a bare string. */
type KokoroVoice = NonNullable<Parameters<KokoroTTS['generate']>[1]>['voice']

/** Pause inserted after a sentence, by what the sentence ended. Seconds. */
const SILENCE = {
  sentence: 0.15,
  block: 0.4,
  heading: 0.7,
} as const

/**
 * Every request carries an id, and every terminal response echoes it. Matching
 * responses by type alone cannot tell two concurrent requests apart — a voice
 * preview fired during a conversion would be mistaken for the chapter the
 * conversion is waiting on, and the book would stall.
 */
export interface RequestEnvelope {
  requestId: number
}

export type NarrateRequest = RequestEnvelope &
  (
    | { type: 'load'; dtype: Dtype; device: Device }
    | { type: 'cancel' }
    | { type: 'sample'; voice: string; text: string; speed: number }
    | {
        type: 'narrate'
        chapterIndex: number
        voice: string
        speed: number
        sentences: SentenceSpan[]
      }
  )

export type Dtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
export type Device = 'wasm' | 'webgpu'

export interface NarrateStats {
  chars: number
  sentences: number
  audioSec: number
  generateMs: number
  /** Prose characters narrated per wall-clock second. The viability number. */
  charsPerSec: number
  /** Audio seconds produced per wall-clock second. >1 is faster than realtime. */
  realtimeFactor: number
}

/** Progress updates carry no id — they belong to whatever is running. */
/**
 * A request before its id is assigned. Distributive by design — a plain
 * `Omit` over a union collapses it to the keys every member shares, which
 * would erase every field that makes a request what it is.
 */
export type NarrateCommand = NarrateRequest extends infer T
  ? T extends NarrateRequest
    ? Omit<T, 'requestId'>
    : never
  : never

export type NarrateProgress =
  | { type: 'status'; label: string; progress?: number }
  | {
      type: 'sentence'
      chapterIndex: number
      index: number
      total: number
      audioSec: number
      generateMs: number
    }

/** Terminal responses settle exactly one request. */
export type NarrateResult = RequestEnvelope &
  (
    | { type: 'ready'; device: Device; dtype: Dtype; loadMs: number; webgpuAvailable: boolean }
    | { type: 'sample'; pcm: Float32Array; sampleRate: number; generateMs: number }
    | {
        type: 'chapter'
        chapterIndex: number
        pcm: Float32Array
        sampleRate: number
        timeline: TimedSentence[]
        stats: NarrateStats
      }
    | { type: 'cancelled'; chapterIndex: number }
    | { type: 'error'; message: string }
  )

export type NarrateResponse = NarrateProgress | NarrateResult

const post = (message: NarrateResponse, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(message, transfer ?? [])

let tts: KokoroTTS | null = null
let loadedWith: { dtype: Dtype; device: Device } | null = null

/**
 * The load currently running, if any, keyed by what it is loading.
 *
 * Two callers can ask for the model at the same moment — a conversion starting
 * while the voice picker previews a voice — and `tts` is only assigned once the
 * download has finished. Without a promise to join, the second caller starts a
 * second 326 MB download into a second ONNX session, doubling the wait and the
 * memory for no gain.
 */
let inFlightLoad: { key: string; promise: Promise<KokoroTTS> } | null = null

/**
 * Set when the reader asks to stop.
 *
 * Generation is per sentence, but a chapter is one request, so without a flag
 * the worker cannot be interrupted until the whole chapter is spoken — which
 * for a real chapter is minutes of nothing happening after Stop is pressed.
 */
let stopRequested = false

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

async function load(dtype: Dtype, device: Device, requestId: number): Promise<void> {
  // WebGPU only produces correct audio at fp32. The quantized dtypes do not
  // error there — they emit corrupted phonemes that sound like another
  // language, so this has to be refused rather than merely discouraged.
  if (device === 'webgpu' && dtype !== 'fp32') {
    throw new Error(
      `Kokoro requires fp32 on WebGPU; ${dtype} produces corrupted audio. Use fp32, or switch to the WASM device.`,
    )
  }

  // Already resident: still answer. Every request owes exactly one terminal
  // response — returning silently here leaves the caller awaiting a message
  // that will never arrive, which surfaces as a preview that spins forever.
  if (tts && loadedWith?.dtype === dtype && loadedWith?.device === device) {
    post({ type: 'ready', requestId, device, dtype, loadMs: 0, webgpuAvailable: hasWebGpu() })
    return
  }

  const startedAt = performance.now()
  const key = `${device}:${dtype}`

  if (!inFlightLoad || inFlightLoad.key !== key) {
    const attempt = { key, promise: fetchModel(dtype, device) }
    inFlightLoad = attempt
    // A finished attempt must not stay registered — a failed one especially,
    // or the next request would join a promise that has already rejected and
    // the model could never be retried without reloading the tab.
    void attempt.promise
      .catch(() => undefined)
      .then(() => {
        if (inFlightLoad === attempt) inFlightLoad = null
      })
  }

  // Assigned only on success: a failed load must leave whatever was already
  // resident alone rather than replacing it with null.
  const model = await inFlightLoad.promise
  tts = model
  loadedWith = { dtype, device }

  post({ type: 'status', label: 'ready' })
  post({
    type: 'ready',
    requestId,
    device,
    dtype,
    loadMs: Math.round(performance.now() - startedAt),
    webgpuAvailable: hasWebGpu(),
  })
}

function fetchModel(dtype: Dtype, device: Device): Promise<KokoroTTS> {
  post({ type: 'status', label: `loading Kokoro (${dtype}, ${device})…`, progress: 0 })

  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device,
    progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
      if (info.status === 'progress' && typeof info.progress === 'number') {
        post({
          type: 'status',
          label: `downloading ${info.file ?? 'model'}…`,
          progress: info.progress / 100,
        })
      }
    },
  })
}

function requireModel(): KokoroTTS {
  if (!tts) throw new Error('model not loaded')
  return tts
}

/** Concatenate PCM segments into one buffer. */
function concatPcm(segments: Float32Array[], totalLength: number): Float32Array {
  const out = new Float32Array(totalLength)
  let at = 0
  for (const segment of segments) {
    out.set(segment, at)
    at += segment.length
  }
  return out
}

function silenceFor(sentence: SentenceSpan): number {
  if (sentence.blockType.startsWith('h')) return SILENCE.heading
  if (sentence.endsBlock) return SILENCE.block
  return SILENCE.sentence
}

async function narrate(
  chapterIndex: number,
  sentences: SentenceSpan[],
  voice: string,
  speed: number,
  requestId: number,
): Promise<void> {
  const model = requireModel()
  stopRequested = false
  const segments: Float32Array[] = []
  const timeline: TimedSentence[] = []

  let sampleRate = 24000
  let samples = 0
  let chars = 0
  let generateMs = 0

  for (let i = 0; i < sentences.length; i++) {
    // Checked every sentence: this is the finest grain the model offers, and
    // it bounds how long Stop takes to be felt to one sentence.
    if (stopRequested) {
      post({ type: 'cancelled', requestId, chapterIndex })
      return
    }

    const sentence = sentences[i]
    const clipBeginSamples = samples
    const sentenceStartedAt = performance.now()

    // Long sentences are synthesised in pieces but stay ONE sync unit: the
    // sentence's clipEnd is the end of its final chunk.
    for (const chunk of sentence.chunks) {
      const audio = await model.generate(chunk, {
        voice: voice as KokoroVoice,
        speed,
      })
      sampleRate = audio.sampling_rate
      segments.push(audio.audio)
      samples += audio.audio.length
    }

    const elapsed = performance.now() - sentenceStartedAt
    generateMs += elapsed
    chars += sentence.text.length

    const speechEndSamples = samples

    // Pad with silence so sentences do not run together.
    const gapSec = silenceFor(sentence)
    const gapSamples = Math.round(gapSec * sampleRate)
    if (gapSamples > 0 && i < sentences.length - 1) {
      segments.push(new Float32Array(gapSamples))
      samples += gapSamples
    }

    // Extend clipEnd halfway into the gap. Ending exactly at the last sample
    // blanks the highlight during the pause, which reads as a dropped frame.
    const holdSamples = i < sentences.length - 1 ? Math.round(gapSamples / 2) : 0

    timeline.push({
      id: sentence.id,
      text: sentence.text,
      clipBegin: clipBeginSamples / sampleRate,
      clipEnd: (speechEndSamples + holdSamples) / sampleRate,
    })

    post({
      type: 'sentence',
      chapterIndex,
      index: i + 1,
      total: sentences.length,
      audioSec: samples / sampleRate,
      generateMs: Math.round(elapsed),
    })
  }

  const pcm = concatPcm(segments, samples)
  const audioSec = samples / sampleRate
  const generateSec = generateMs / 1000

  post(
    {
      type: 'chapter',
      requestId,
      chapterIndex,
      pcm,
      sampleRate,
      timeline,
      stats: {
        chars,
        sentences: sentences.length,
        audioSec,
        generateMs: Math.round(generateMs),
        charsPerSec: generateSec > 0 ? chars / generateSec : 0,
        realtimeFactor: generateSec > 0 ? audioSec / generateSec : 0,
      },
    },
    [pcm.buffer],
  )
}

self.onmessage = async (event: MessageEvent<NarrateRequest>) => {
  const request = event.data
  const { requestId } = request
  try {
    if (request.type === 'cancel') {
      stopRequested = true
      return
    }

    if (request.type === 'load') {
      await load(request.dtype, request.device, requestId)
      return
    }

    if (request.type === 'sample') {
      const model = requireModel()
      const startedAt = performance.now()
      const audio = await model.generate(request.text, {
        voice: request.voice as KokoroVoice,
        speed: request.speed,
      })
      post(
        {
          type: 'sample',
          requestId,
          pcm: audio.audio,
          sampleRate: audio.sampling_rate,
          generateMs: Math.round(performance.now() - startedAt),
        },
        [audio.audio.buffer],
      )
      return
    }

    if (request.type === 'narrate') {
      await narrate(
        request.chapterIndex,
        request.sentences,
        request.voice,
        request.speed,
        requestId,
      )
    }
  } catch (err) {
    post({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
