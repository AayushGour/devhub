// MP3 encoder worker.
//
// Kokoro emits Float32 PCM at 24 kHz. Raw, a 10-hour book is ~1.7 GB — past
// what IndexedDB will hold. MP3 mono @ 48 kbps brings that to ~216 MB, and
// audio/mpeg is an EPUB 3 Core Media Type, so exports play in real readers.
//
// Lives in its own worker so chapter N encodes while chapter N+1 is still
// being synthesised.

import { Mp3Encoder } from '@breezystack/lamejs'

/** MP3 frames are 1152 samples; feeding the encoder in frame units avoids padding. */
const SAMPLES_PER_FRAME = 1152

export interface EncodeRequest {
  chapterIndex: number
  pcm: Float32Array
  sampleRate: number
  kbps: number
}

export interface EncodeResponse {
  type: 'encoded'
  chapterIndex: number
  mp3: Uint8Array
  bytes: number
  encodeMs: number
}

export interface EncodeError {
  type: 'error'
  chapterIndex: number
  message: string
}

/** Float32 [-1, 1] -> signed 16-bit PCM, clamped rather than wrapped. */
function toInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

export function encodeMp3(pcm: Float32Array, sampleRate: number, kbps: number): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const samples = toInt16(pcm)
  const chunks: Uint8Array[] = []

  for (let offset = 0; offset < samples.length; offset += SAMPLES_PER_FRAME) {
    const frame = samples.subarray(offset, offset + SAMPLES_PER_FRAME)
    const encoded = encoder.encodeBuffer(frame)
    if (encoded.length > 0) chunks.push(encoded)
  }

  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)

  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const mp3 = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    mp3.set(chunk, at)
    at += chunk.length
  }
  return mp3
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { chapterIndex, pcm, sampleRate, kbps } = event.data
  try {
    const startedAt = performance.now()
    const mp3 = encodeMp3(pcm, sampleRate, kbps)
    const response: EncodeResponse = {
      type: 'encoded',
      chapterIndex,
      mp3,
      bytes: mp3.length,
      encodeMs: Math.round(performance.now() - startedAt),
    }
    // Transfer the buffer — a chapter's MP3 can be tens of megabytes.
    ;(self as unknown as Worker).postMessage(response, [mp3.buffer])
  } catch (err) {
    const response: EncodeError = {
      type: 'error',
      chapterIndex,
      message: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
