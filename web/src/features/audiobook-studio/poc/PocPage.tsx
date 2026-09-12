// Audiobook Studio — proof of concept.
//
// Throwaway UI wrapped around the real pipeline. Its job is to answer four
// questions before the full build starts:
//   R1  kokoro-js loads and runs in a Vite ES worker, on WebGPU
//   R2  measured throughput -> is narrating a whole book actually viable
//   R3  sentence timings are tight enough to drive a read-along highlight
//   R4  the sealed EPUB 3 plays, in sync, in a real reader (Thorium)
//
// Everything here is scaffolding. The utils/ modules it calls are not.

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookAudio, Download, Loader2, Play, Square, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createLogger } from '@/lib/logger'
import { isWebGpuAvailable } from '@/lib/webgpu'
import { buildSentences, type SentenceSpan } from '../utils/sentences'
import { findSentenceAt, tokenizeWords, wordSpanAt, type TimedSentence } from '../utils/timeline'
import { DEFAULT_VOICE_ID, SAMPLE_SENTENCE, VOICE_PACKS, describeVoice } from '../utils/voices'
import { buildEpubFiles, type ChapterInput } from '../utils/epubWrite'
import { sealEpub } from '../utils/zip'
import { readEpub, readPlainText, type PocBook } from './pocEpubRead'
import type { Device, Dtype, NarrateRequest, NarrateResponse, NarrateStats } from './pocNarrate.worker'
import type { EncodeError, EncodeRequest, EncodeResponse } from './pocEncode.worker'

const log = createLogger('audiobook:poc')

/** Rough industry average for a trade paperback page. Used only for projections. */
const CHARS_PER_PAGE = 1800
const PROJECTION_PAGES = 300

const MP3_KBPS = 48

// Precision is not a user choice — exactly one dtype is correct per device, so
// exposing it only creates a way to get it wrong. WebGPU requires fp32; the
// quantized dtypes there emit corrupted audio rather than failing loudly. WASM
// has no such constraint, so it takes the smallest build that sounds right.
const BUILD_FOR_DEVICE: Record<Device, { dtype: Dtype; label: string; downloadMB: number }> = {
  webgpu: { dtype: 'fp32', label: 'WebGPU', downloadMB: 326 },
  wasm: { dtype: 'q8', label: 'WASM (CPU)', downloadMB: 86 },
}

/** What the user asks for; 'auto' is resolved against the actual hardware. */
type DevicePreference = 'auto' | Device

interface NarratedChapter {
  index: number
  title: string
  sentences: SentenceSpan[]
  timeline: TimedSentence[]
  mp3: Uint8Array
  durationSec: number
  stats: NarrateStats
}

type Phase = 'idle' | 'loading' | 'narrating' | 'done'

const PANEL = 'bg-surface-raised border border-border rounded-xl'
const FIELD =
  'w-full bg-surface border border-border rounded-lg px-[0.625rem] py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'
const BUTTON =
  'inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Play raw PCM without encoding it first — used for voice previews. */
function playPcm(pcm: Float32Array, sampleRate: number): void {
  const ctx = new AudioContext({ sampleRate })
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
  // set() rather than copyToChannel(): the PCM arrives from a worker as a
  // Float32Array<ArrayBufferLike>, which copyToChannel's signature rejects.
  buffer.getChannelData(0).set(pcm)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.onended = () => void ctx.close()
  source.start()
}

/**
 * Probe the hardware once per session. `use()` suspends until it resolves, so
 * the device is DERIVED from the preference rather than stored — no effect, no
 * state to fall out of sync with the dropdown.
 */
function PocPageInner({ detection }: { detection: Promise<Device> }) {
  const detected = use(detection)

  const [book, setBook] = useState<PocBook | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [devicePreference, setDevicePreference] = useState<DevicePreference>('auto')
  const device: Device = devicePreference === 'auto' ? detected : devicePreference
  const build = BUILD_FOR_DEVICE[device]
  const [voice, setVoice] = useState(DEFAULT_VOICE_ID)
  const [speed, setSpeed] = useState(1)

  const [chapters, setChapters] = useState<NarratedChapter[]>([])
  const [activeChapter, setActiveChapter] = useState(0)
  const [activeSentence, setActiveSentence] = useState(-1)
  const [wordRange, setWordRange] = useState<{ start: number; end: number } | null>(null)
  const [loadMs, setLoadMs] = useState(0)
  const [pasted, setPasted] = useState('')

  const narrateRef = useRef<Worker | null>(null)
  const encodeRef = useRef<Worker | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const frameRef = useRef(0)

  // Resolvers for the current in-flight worker request. The POC drives the
  // pipeline strictly one step at a time, so a single slot per worker is enough.
  const narratePending = useRef<{
    resolve: (value: NarrateResponse) => void
    reject: (reason: Error) => void
    want: NarrateResponse['type']
  } | null>(null)
  const encodePending = useRef<{
    resolve: (value: EncodeResponse) => void
    reject: (reason: Error) => void
  } | null>(null)

  useEffect(() => {
    const narrateWorker = new Worker(new URL('./pocNarrate.worker.ts', import.meta.url), {
      type: 'module',
    })
    const encodeWorker = new Worker(new URL('./pocEncode.worker.ts', import.meta.url), {
      type: 'module',
    })

    narrateWorker.onmessage = (event: MessageEvent<NarrateResponse>) => {
      const message = event.data

      if (message.type === 'status') {
        setStatus(message.label)
        if (message.progress !== undefined) setProgress(message.progress)
        return
      }
      if (message.type === 'sentence') {
        setStatus(`narrating sentence ${message.index}/${message.total}`)
        setProgress(message.index / message.total)
        return
      }
      if (message.type === 'error') {
        log.error('narrate worker:', message.message)
        narratePending.current?.reject(new Error(message.message))
        narratePending.current = null
        return
      }
      if (narratePending.current?.want === message.type) {
        narratePending.current.resolve(message)
        narratePending.current = null
      }
    }

    narrateWorker.onerror = (event) => {
      const reason = new Error(event.message || 'narrate worker crashed')
      log.error('narrate worker crashed:', event.message)
      narratePending.current?.reject(reason)
      narratePending.current = null
      setError(reason.message)
      setPhase('idle')
    }

    encodeWorker.onmessage = (event: MessageEvent<EncodeResponse | EncodeError>) => {
      const message = event.data
      if (message.type === 'error') {
        encodePending.current?.reject(new Error(message.message))
      } else {
        encodePending.current?.resolve(message)
      }
      encodePending.current = null
    }

    narrateRef.current = narrateWorker
    encodeRef.current = encodeWorker

    return () => {
      narrateWorker.terminate()
      encodeWorker.terminate()
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const askNarrate = useCallback(
    (request: NarrateRequest, want: NarrateResponse['type']) =>
      new Promise<NarrateResponse>((resolve, reject) => {
        const worker = narrateRef.current
        if (!worker) return reject(new Error('narrate worker unavailable'))
        narratePending.current = { resolve, reject, want }
        worker.postMessage(request)
      }),
    [],
  )

  const askEncode = useCallback(
    (request: EncodeRequest) =>
      new Promise<EncodeResponse>((resolve, reject) => {
        const worker = encodeRef.current
        if (!worker) return reject(new Error('encode worker unavailable'))
        encodePending.current = { resolve, reject }
        worker.postMessage(request, [request.pcm.buffer])
      }),
    [],
  )

  const ensureModel = useCallback(async () => {
    const ready = await askNarrate(
      { type: 'load', dtype: BUILD_FOR_DEVICE[device].dtype, device },
      'ready',
    )
    if (ready.type === 'ready') setLoadMs(ready.loadMs)
  }, [askNarrate, device])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    try {
      const loaded = file.name.toLowerCase().endsWith('.epub')
        ? await readEpub(file)
        : readPlainText(await file.text(), file.name)
      setBook(loaded)
      setChapters([])
      setPhase('idle')
      log.log(`loaded "${loaded.title}" — ${loaded.chapters.length} chapters`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const previewVoice = useCallback(async () => {
    setError(null)
    setPhase('loading')
    try {
      await ensureModel()
      setStatus('synthesising sample…')
      const sample = await askNarrate(
        { type: 'sample', voice, text: SAMPLE_SENTENCE, speed },
        'sample',
      )
      if (sample.type === 'sample') {
        playPcm(sample.pcm, sample.sampleRate)
        setStatus(`sample ready in ${sample.generateMs} ms`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase('idle')
    }
  }, [askNarrate, ensureModel, speed, voice])

  const narrateBook = useCallback(async () => {
    if (!book) return
    setError(null)
    setChapters([])
    setPhase('loading')

    try {
      await ensureModel()
      setPhase('narrating')

      const done: NarratedChapter[] = []
      for (let i = 0; i < book.chapters.length; i++) {
        const chapter = book.chapters[i]
        setStatus(`chapter ${i + 1}/${book.chapters.length} — ${chapter.title}`)

        const sentences = buildSentences(chapter.blocks, book.language)
        if (sentences.length === 0) continue

        const narrated = await askNarrate(
          { type: 'narrate', voice, speed, sentences },
          'chapter',
        )
        if (narrated.type !== 'chapter') continue

        const encoded = await askEncode({
          chapterIndex: i + 1,
          pcm: narrated.pcm,
          sampleRate: narrated.sampleRate,
          kbps: MP3_KBPS,
        })

        done.push({
          index: i + 1,
          title: chapter.title,
          sentences,
          timeline: narrated.timeline,
          mp3: encoded.mp3,
          durationSec: narrated.stats.audioSec,
          stats: narrated.stats,
        })

        // Publish after every chapter — this is the progressive-read behaviour
        // the full design depends on, proven here in miniature.
        setChapters([...done])
      }

      setPhase('done')
      setStatus(`narrated ${done.length} chapters`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('idle')
    }
  }, [askEncode, askNarrate, book, ensureModel, speed, voice])

  const current = chapters[activeChapter]

  // Chapter audio: the MP3 we just encoded, so playback also verifies the file
  // the export will contain.
  const audioUrl = useMemo(() => {
    if (!current) return null
    const blob = new Blob([current.mp3 as unknown as BlobPart], { type: 'audio/mpeg' })
    return URL.createObjectURL(blob)
  }, [current])

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  // The highlight loop. Sentence index comes from exact SMIL timings; the word
  // is interpolated inside the sentence and resyncs at every boundary.
  const startTracking = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current
      const timeline = current?.timeline
      if (audio && timeline) {
        const index = findSentenceAt(timeline, audio.currentTime)
        setActiveSentence(index)
        setWordRange(index >= 0 ? wordSpanAt(timeline[index], audio.currentTime) : null)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)
  }, [current])

  const stopTracking = useCallback(() => cancelAnimationFrame(frameRef.current), [])

  const seekToSentence = useCallback(
    (sentenceId: string) => {
      const audio = audioRef.current
      const entry = current?.timeline.find((s) => s.id === sentenceId)
      if (audio && entry) {
        audio.currentTime = entry.clipBegin
        void audio.play()
      }
    },
    [current],
  )

  const exportEpub = useCallback(async () => {
    if (!book || chapters.length === 0) return
    setStatus('sealing EPUB…')
    try {
      const inputs: ChapterInput[] = chapters.map((c) => ({
        index: c.index,
        title: c.title,
        blocks: book.chapters[c.index - 1].blocks,
        sentences: c.sentences,
        timeline: c.timeline,
        durationSec: c.durationSec,
      }))
      const audioByChapter = new Map(chapters.map((c) => [c.index, c.mp3]))

      const files = buildEpubFiles(
        {
          identifier: `urn:uuid:devhub-poc-${book.title.replace(/\W+/g, '-').toLowerCase()}`,
          title: book.title,
          author: book.author,
          language: book.language,
        },
        inputs,
        audioByChapter,
      )

      const blob = await sealEpub(files)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${book.title.replace(/[^\w\s-]/g, '')}.epub`
      link.click()
      URL.revokeObjectURL(url)
      setStatus(`exported ${formatBytes(blob.size)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [book, chapters])

  // R2: extrapolate the measured rate to a full-length book.
  const projection = useMemo(() => {
    if (chapters.length === 0) return null
    const chars = chapters.reduce((n, c) => n + c.stats.chars, 0)
    const audioSec = chapters.reduce((n, c) => n + c.stats.audioSec, 0)
    const generateMs = chapters.reduce((n, c) => n + c.stats.generateMs, 0)
    const bytes = chapters.reduce((n, c) => n + c.mp3.length, 0)
    if (chars === 0 || generateMs === 0) return null

    const charsPerSec = chars / (generateMs / 1000)
    const bookChars = CHARS_PER_PAGE * PROJECTION_PAGES

    return {
      charsPerSec,
      realtimeFactor: audioSec / (generateMs / 1000),
      measuredChars: chars,
      measuredAudioSec: audioSec,
      measuredBytes: bytes,
      bookConvertSec: bookChars / charsPerSec,
      bookAudioSec: (bookChars / chars) * audioSec,
      bookBytes: (bookChars / chars) * bytes,
    }
  }, [chapters])

  const sentencesByBlock = useMemo(() => {
    const map = new Map<number, SentenceSpan[]>()
    for (const sentence of current?.sentences ?? []) {
      const list = map.get(sentence.blockIdx)
      if (list) list.push(sentence)
      else map.set(sentence.blockIdx, [sentence])
    }
    return map
  }, [current])

  const activeSentenceId =
    activeSentence >= 0 ? current?.timeline[activeSentence]?.id : undefined

  const busy = phase === 'loading' || phase === 'narrating'

  return (
    <div className="studio-root">
      <div className="flex flex-1 min-h-0">
        {/* Controls */}
        <aside className="w-[20rem] shrink-0 border-r border-border overflow-y-auto p-4 flex flex-col gap-4">
          <header className="flex items-center gap-2">
            <BookAudio size={18} className="text-accent" />
            <h1 className="text-sm font-semibold text-on-surface">Audiobook POC</h1>
          </header>

          <label
            className={cn(
              PANEL,
              'flex flex-col items-center gap-2 p-6 text-center cursor-pointer border-dashed hover:border-accent transition-colors duration-150',
            )}
          >
            <Upload size={18} className="text-on-surface-muted" />
            <span className="text-xs text-on-surface-muted">
              Drop an EPUB or text file
            </span>
            <input
              type="file"
              accept=".epub,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>

          <div className="flex flex-col gap-2">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'…or paste prose here.\nLines starting with # begin a chapter.'}
              className={cn(FIELD, 'h-[6rem] resize-none cursor-text leading-relaxed')}
            />
            <button
              type="button"
              disabled={!pasted.trim()}
              onClick={() => setBook(readPlainText(pasted, 'Pasted text'))}
              className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
            >
              Use pasted text
            </button>
          </div>

          <div className={cn(PANEL, 'p-3 flex flex-col gap-3')}>
            <Field label="Device">
              <select
                value={devicePreference}
                onChange={(e) => setDevicePreference(e.target.value as DevicePreference)}
                className={FIELD}
              >
                <option value="auto">Auto-detect</option>
                <option value="webgpu">WebGPU</option>
                <option value="wasm">WASM (CPU)</option>
              </select>
              <p className="text-xs text-on-surface-muted">
                {`${build.label} · ${build.dtype} · ${build.downloadMB} MB download`}
                {devicePreference === 'auto' && detected === 'wasm' && ' · no WebGPU found'}
              </p>
            </Field>

            <Field label="Voice">
              <div className="flex flex-col gap-2">
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className={FIELD}
                >
                  {Object.values(VOICE_PACKS).map((pack) => (
                    <optgroup key={pack.lang} label={pack.label}>
                      {pack.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {describeVoice(v)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void previewVoice()}
                  disabled={busy}
                  className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
                >
                  <Play size={12} />
                  Preview voice
                </button>
              </div>
            </Field>

            <Field label={`Speed — ${speed.toFixed(2)}×`}>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => void narrateBook()}
            disabled={!book || busy}
            className={cn(BUTTON, 'border-accent bg-accent text-accent-text hover:bg-accent-hover')}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BookAudio size={13} />}
            {busy ? 'Working…' : `Narrate${book ? ` ${book.chapters.length} chapters` : ''}`}
          </button>

          <button
            type="button"
            onClick={() => void exportEpub()}
            disabled={chapters.length === 0}
            className={cn(BUTTON, 'border-border text-on-surface hover:bg-surface-hover')}
          >
            <Download size={13} />
            Export EPUB 3
          </button>

          {busy && (
            <div className={cn(PANEL, 'p-3 flex flex-col gap-2')}>
              <p className="text-xs text-on-surface-muted">{status}</p>
              <div className="h-1 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {!busy && status && (
            <p className="text-xs text-on-surface-muted">{status}</p>
          )}

          {error && (
            <p className="text-xs text-red-400 leading-relaxed">{error}</p>
          )}

          {projection && (
            <div className={cn(PANEL, 'p-3 flex flex-col gap-1.5')}>
              <p className="text-xs font-semibold text-on-surface">Measured</p>
              <Metric label="Model load" value={`${(loadMs / 1000).toFixed(1)} s`} />
              <Metric label="Throughput" value={`${projection.charsPerSec.toFixed(0)} chars/s`} />
              <Metric
                label="vs realtime"
                value={`${projection.realtimeFactor.toFixed(2)}×`}
              />
              <Metric
                label="Sample"
                value={`${projection.measuredChars.toLocaleString()} chars → ${formatDuration(projection.measuredAudioSec)}`}
              />
              <p className="text-xs font-semibold text-on-surface mt-2">
                Projected · {PROJECTION_PAGES}-page book
              </p>
              <Metric label="Convert time" value={formatDuration(projection.bookConvertSec)} />
              <Metric label="Audio length" value={formatDuration(projection.bookAudioSec)} />
              <Metric label="MP3 size" value={formatBytes(projection.bookBytes)} />
            </div>
          )}
        </aside>

        {/* Reader */}
        <section className="flex-1 min-w-0 flex flex-col">
          {chapters.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 overflow-x-auto">
                {chapters.map((c, i) => (
                  <button
                    key={c.index}
                    type="button"
                    onClick={() => setActiveChapter(i)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-lg border whitespace-nowrap transition-colors duration-150',
                      i === activeChapter
                        ? 'border-accent text-accent'
                        : 'border-border text-on-surface-muted hover:bg-surface-hover',
                    )}
                  >
                    {c.index}. {c.title}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
                <article className="max-w-[42rem] mx-auto text-[1.0625rem] leading-[1.7] text-on-surface">
                  {(book?.chapters[activeChapter]?.blocks ?? []).map((block, blockIdx) => {
                    const spans = sentencesByBlock.get(blockIdx) ?? []
                    const Tag = block.type.startsWith('h') ? 'h2' : 'p'
                    return (
                      <Tag
                        key={blockIdx}
                        className={cn(
                          block.type.startsWith('h')
                            ? 'text-xl font-semibold mt-8 mb-3'
                            : 'mb-4',
                        )}
                      >
                        {spans.length === 0
                          ? block.text
                          : spans.map((span) => (
                              <Sentence
                                key={span.id}
                                text={span.text}
                                active={span.id === activeSentenceId}
                                wordRange={span.id === activeSentenceId ? wordRange : null}
                                onClick={() => seekToSentence(span.id)}
                              />
                            ))}
                      </Tag>
                    )
                  })}
                </article>
              </div>

              <div className="shrink-0 border-t border-border px-6 py-3 flex items-center gap-3">
                {audioUrl && (
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    onPlay={startTracking}
                    onPause={stopTracking}
                    onEnded={stopTracking}
                    className="flex-1 h-9"
                  />
                )}
                <button
                  type="button"
                  onClick={stopTracking}
                  className={cn(BUTTON, 'border-border text-on-surface-muted hover:bg-surface-hover')}
                >
                  <Square size={12} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-on-surface-muted">
                {book
                  ? `"${book.title}" — ${book.chapters.length} chapters ready to narrate.`
                  : 'Load a book to begin.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Owns the detection promise. Kept outside the suspending component so the
 * promise is created once rather than on every retry of the inner render.
 */
export default function PocPage() {
  const [detection] = useState(() =>
    isWebGpuAvailable().then((available): Device => (available ? 'webgpu' : 'wasm')),
  )

  return (
    <Suspense
      fallback={
        <div className="studio-root items-center justify-center">
          <p className="text-sm text-on-surface-muted">Detecting the best device…</p>
        </div>
      }
    >
      <PocPageInner detection={detection} />
    </Suspense>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-on-surface-muted">{label}</span>
      {children}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-on-surface-muted">{label}</span>
      <span className="text-xs text-on-surface font-medium tabular-nums">{value}</span>
    </div>
  )
}

interface SentenceProps {
  text: string
  active: boolean
  wordRange: { start: number; end: number } | null
  onClick: () => void
}

/**
 * One sync unit. The sentence highlight is exact; the word highlight inside it
 * is interpolated, which is what R3 is there to judge.
 */
function Sentence({ text, active, wordRange, onClick }: SentenceProps) {
  const words = useMemo(() => tokenizeWords(text), [text])

  const body =
    active && wordRange && words.length > 0 ? (
      <>
        {text.slice(0, wordRange.start)}
        <mark className="bg-accent text-accent-text rounded-[0.15rem] px-px">
          {text.slice(wordRange.start, wordRange.end)}
        </mark>
        {text.slice(wordRange.end)}
      </>
    ) : (
      text
    )

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
        className={cn(
          'cursor-pointer rounded-[0.15rem] transition-colors duration-150',
          active ? 'bg-accent/20' : 'hover:bg-surface-hover',
        )}
      >
        {body}
      </span>{' '}
    </>
  )
}
