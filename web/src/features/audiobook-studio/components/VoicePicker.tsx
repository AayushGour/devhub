import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createLogger } from '@/lib/logger'
import { previewVoice } from '../utils/conversionEngine'
import { SAMPLE_SENTENCE, VOICE_PACKS, describeVoice } from '../utils/voices'

const log = createLogger('audiobook:voice')

interface Props {
  value: string
  speed: number
  disabled?: boolean
  onChange: (voiceId: string) => void
}

const FIELD =
  'w-full bg-surface border border-border rounded-lg px-[0.625rem] py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'

/** Closing a context twice rejects, so the state is checked before asking. */
function closeContext(ctx: AudioContext | null): void {
  if (!ctx || ctx.state === 'closed') return
  void ctx.close().catch(() => {
    // Already closing, or the context was never started — nothing to recover.
  })
}

/** Play PCM straight from the model — no encoding step for a two-second sample. */
function playPcm(pcm: Float32Array, sampleRate: number): AudioContext {
  const ctx = new AudioContext({ sampleRate })
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate)
  buffer.getChannelData(0).set(pcm)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.onended = () => closeContext(ctx)
  source.start()
  return ctx
}

export default function VoicePicker({ value, speed, disabled, onChange }: Props) {
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The context playing the current sample. A preview outlives the click that
  // started it, so without a handle on it the only thing that could ever close
  // it was its own `onended` — and a dialog closed mid-sample leaked it.
  const contextRef = useRef<AudioContext | null>(null)
  // Bumped per attempt so synthesis that lands after a newer preview started,
  // or after unmount, throws its audio away instead of talking over it.
  const runRef = useRef(0)

  const stop = useCallback(() => {
    closeContext(contextRef.current)
    contextRef.current = null
  }, [])

  useEffect(() => () => {
    runRef.current++
    stop()
  }, [stop])

  const preview = async () => {
    // Supersede whatever is playing or still synthesising. Two clicks used to
    // mean two contexts and two voices reading the sample at once.
    const run = ++runRef.current
    stop()

    setPreviewing(true)
    setError(null)
    try {
      const { pcm, sampleRate } = await previewVoice(value, SAMPLE_SENTENCE, speed)
      if (run !== runRef.current) return
      contextRef.current = playPcm(pcm, sampleRate)
    } catch (err) {
      if (run !== runRef.current) return
      const message = err instanceof Error ? err.message : String(err)
      log.error('preview failed:', message)
      setError(message)
    } finally {
      if (run === runRef.current) setPreviewing(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      >
        {Object.values(VOICE_PACKS).map((pack) => (
          <optgroup key={pack.lang} label={pack.label}>
            {pack.voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {describeVoice(voice)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <button
        type="button"
        onClick={() => void preview()}
        disabled={disabled || previewing}
        className={cn(
          'inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg',
          'border border-border text-on-surface hover:bg-surface-hover',
          'transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        {previewing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {previewing ? 'Synthesising…' : 'Preview voice'}
      </button>

      {error && <p className="text-xs text-red-400 leading-relaxed">{error}</p>}
    </div>
  )
}
