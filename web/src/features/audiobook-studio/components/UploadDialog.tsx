import { useState } from 'react'
import { BookAudio, Radio, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import VoicePicker from './VoicePicker'
import { estimateQuota, requestPersistence } from '../utils/db'
import type { BookMode } from '../types'

interface Props {
  defaultVoiceId: string
  speed: number
  onCancel: () => void
  onImport: (file: File, mode: BookMode, voiceId: string) => void
}

const EXTENSIONS = ['.epub', '.pdf', '.txt', '.md', '.markdown', '.docx']
const ACCEPT = EXTENSIONS.join(',')

const CARD = 'bg-surface-raised border border-border rounded-xl'

/**
 * The extension filter the picker applies, applied by hand.
 *
 * `accept` on a file input constrains only the PICKER. A drop lands whatever
 * the reader dragged, and the import path writes the book row before it parses
 * anything — so a stray `.jpg` used to become a permanent failed book that had
 * to be deleted by hand. Cheaper to refuse it here.
 */
function isAcceptedFile(name: string): boolean {
  const lower = name.toLowerCase()
  return EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export default function UploadDialog({ defaultVoiceId, speed, onCancel, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<BookMode>('narrated')
  const [voiceId, setVoiceId] = useState(defaultVoiceId)
  const [dragging, setDragging] = useState(false)
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string | null>(null)

  const accept = async (picked: File) => {
    if (!isAcceptedFile(picked.name)) {
      setRejected(
        `${picked.name} is not a kind of book this can read. Use EPUB, PDF, Word, Markdown or plain text.`,
      )
      return
    }

    setRejected(null)
    setFile(picked)

    // A narrated book runs to hundreds of megabytes. Better to say so now than
    // to fail two hours into a conversion.
    const { available, persisted } = await estimateQuota()
    if (available > 0 && available < 500 * 1024 ** 2) {
      setQuotaWarning(
        `Only ${Math.round(available / 1024 ** 2)} MB of browser storage is available. A narrated book can need several hundred.`,
      )
    } else if (!persisted) {
      setQuotaWarning(
        'The browser has not granted persistent storage, so it may evict this library under disk pressure.',
      )
    } else {
      setQuotaWarning(null)
    }
  }

  const commit = () => {
    if (!file) return

    // This is the first moment the reader has actually asked for something to
    // be kept, so this is where persistence is worth a permission prompt. A
    // live book stores no audio and is not worth asking about at all.
    if (mode === 'narrated') void requestPersistence()

    onImport(file, mode, voiceId)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-[34rem] mx-auto px-6 py-8 flex flex-col gap-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Add a book</h2>
            <p className="text-xs text-on-surface-muted mt-1">
              EPUB, PDF, Word, Markdown or plain text. Everything stays on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            title="Cancel"
            className="p-1 rounded-lg text-on-surface-muted hover:text-on-surface hover:bg-surface-hover transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </header>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const dropped = e.dataTransfer.files?.[0]
            if (dropped) void accept(dropped)
          }}
          className={cn(
            CARD,
            'flex flex-col items-center gap-2 p-8 text-center cursor-pointer border-dashed',
            'transition-colors duration-150',
            dragging ? 'border-accent' : 'hover:border-on-surface-muted',
          )}
        >
          <Upload size={20} className="text-on-surface-muted" />
          <span className="text-xs text-on-surface">
            {file ? file.name : 'Drop a book here, or choose a file'}
          </span>
          {file && (
            <span className="text-[0.65rem] text-on-surface-muted">
              {(file.size / 1024 ** 2).toFixed(1)} MB
            </span>
          )}
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              if (picked) void accept(picked)
            }}
          />
        </label>

        {rejected && (
          <p role="alert" className="text-xs text-red-400 leading-relaxed">
            {rejected}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs text-on-surface-muted">How should it be read?</p>

          <ModeCard
            selected={mode === 'narrated'}
            onSelect={() => setMode('narrated')}
            icon={<BookAudio size={15} />}
            title="Narrate it"
            detail="Generates real audio and a synced EPUB 3 you can export. Takes a while, and the audio is stored on this device."
          />
          <ModeCard
            selected={mode === 'live'}
            onSelect={() => setMode('live')}
            icon={<Radio size={15} />}
            title="Read aloud live"
            detail="Starts immediately using the system voice. Nothing is stored, and there is no file to export."
          />
        </div>

        {mode === 'narrated' && (
          <div className={cn(CARD, 'p-4 flex flex-col gap-2')}>
            <p className="text-xs text-on-surface-muted">Narrator</p>
            <VoicePicker value={voiceId} speed={speed} onChange={setVoiceId} />
          </div>
        )}

        {quotaWarning && mode === 'narrated' && (
          <p className="text-xs text-amber-400 leading-relaxed">{quotaWarning}</p>
        )}

        <button
          type="button"
          disabled={!file}
          onClick={commit}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg',
            'border border-accent bg-accent text-accent-text hover:bg-accent-hover',
            'transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {mode === 'narrated' ? 'Narrate this book' : 'Add and read aloud'}
        </button>
      </div>
    </div>
  )
}

interface ModeCardProps {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  detail: string
}

function ModeCard({ selected, onSelect, icon, title, detail }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border text-left transition-colors duration-150',
        selected
          ? 'border-accent bg-surface-hover'
          : 'border-border hover:bg-surface-hover',
      )}
    >
      <span className={cn('mt-px', selected ? 'text-accent' : 'text-on-surface-muted')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-xs font-medium', selected ? 'text-accent' : 'text-on-surface')}>
          {title}
        </span>
        <span className="block text-[0.65rem] text-on-surface-muted leading-relaxed mt-0.5">
          {detail}
        </span>
      </span>
    </button>
  )
}
