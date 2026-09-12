import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '../utils/format'
import type { PlaybackState } from '../hooks/usePlaybackEngine'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]

interface Props {
  state: PlaybackState
  rate: number
  chapterTitle: string
  chapterIndex: number
  chapterCount: number
  /** False while this chapter has no audio yet — playback is not possible. */
  ready: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
  onRate: (rate: number) => void
  onChapter: (index: number) => void
}

export default function TransportBar({
  state,
  rate,
  chapterTitle,
  chapterIndex,
  chapterCount,
  ready,
  onToggle,
  onSeek,
  onRate,
  onChapter,
}: Props) {
  const iconButton =
    'p-1.5 rounded-lg text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="shrink-0 border-t border-border px-6 py-3 flex items-center gap-3">
      <button
        type="button"
        title="Previous chapter"
        disabled={chapterIndex <= 0}
        onClick={() => onChapter(chapterIndex - 1)}
        className={iconButton}
      >
        <ChevronLeft size={16} />
      </button>

      <button
        type="button"
        title={state.playing ? 'Pause' : 'Play'}
        disabled={!ready}
        onClick={onToggle}
        className={cn(
          'p-2 rounded-full border transition-colors duration-150',
          ready
            ? 'border-accent text-accent hover:bg-accent hover:text-accent-text'
            : 'border-border text-on-surface-muted cursor-not-allowed',
        )}
      >
        {state.playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <button
        type="button"
        title="Next chapter"
        disabled={chapterIndex >= chapterCount - 1}
        onClick={() => onChapter(chapterIndex + 1)}
        className={iconButton}
      >
        <ChevronRight size={16} />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {state.live ? (
          // A live book has no buffer to scrub, so position is the sentence
          // being spoken rather than a time offset.
          <p className="text-xs text-on-surface-muted truncate">
            {chapterTitle} · read aloud live
          </p>
        ) : (
          <>
            <span className="text-xs text-on-surface-muted tabular-nums shrink-0">
              {formatTime(state.currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1, state.duration)}
              step={0.1}
              value={Math.min(state.currentTime, state.duration || 0)}
              disabled={!ready}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="flex-1 accent-accent cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-xs text-on-surface-muted tabular-nums shrink-0">
              {formatTime(state.duration)}
            </span>
          </>
        )}
      </div>

      <select
        value={rate}
        onChange={(e) => onRate(Number(e.target.value))}
        title="Playback speed"
        className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-on-surface outline-none font-[inherit] cursor-pointer shrink-0"
      >
        {RATES.map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
    </div>
  )
}
