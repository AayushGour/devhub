import { Upload, Download, Copy, Layers, Image, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { MethodLabel } from '../hooks/useSvgStudio'

interface Props {
  file: File | null
  activeLabel: MethodLabel | null
  activeSvg: string | null
  hasCompare: boolean
  onNewFile: () => void
  onSwitchToEmbed: () => void
  onSwitchToVector: () => void
}

const BTN = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors duration-150'

export default function SvgToolbar({
  file,
  activeLabel,
  activeSvg,
  hasCompare,
  onNewFile,
  onSwitchToEmbed,
  onSwitchToVector,
}: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!activeSvg) return
    navigator.clipboard.writeText(activeSvg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function handleDownload() {
    if (!activeSvg) return
    const blob = new Blob([activeSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file ? file.name.replace(/\.(png|jpe?g)$/i, '.svg') : 'output.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isEmbed = activeLabel === 'Embed'

  return (
    <div className="shrink-0 h-11 flex items-center gap-2 px-3 border-b border-border bg-surface">
      {/* Title */}
      <span className="text-[13px] font-semibold text-on-surface mr-1">SVG Studio</span>

      {file && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-[12px] text-on-surface-muted truncate max-w-[200px]">{file.name}</span>
          {activeLabel && (
            <span className="text-[11px] font-medium text-accent bg-accent/10 border border-accent/25 rounded-full px-2 py-0.5">
              {activeLabel}
            </span>
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Mode toggles */}
      {activeSvg && (
        <div className="flex items-center gap-px bg-surface-raised border border-border rounded-lg overflow-hidden">
          <button
            onClick={onSwitchToVector}
            disabled={!hasCompare || !isEmbed}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors duration-150',
              !isEmbed
                ? 'bg-accent text-accent-text'
                : 'bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <Layers size={12} />
            Vector
          </button>
          <button
            onClick={onSwitchToEmbed}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors duration-150',
              isEmbed
                ? 'bg-accent text-accent-text'
                : 'bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-hover'
            )}
          >
            <Image size={12} />
            Embed
          </button>
        </div>
      )}

      {activeSvg && (
        <>
          <button
            onClick={handleCopy}
            className={cn(BTN, 'border border-border bg-surface text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy SVG'}
          </button>

          <button
            onClick={handleDownload}
            className={cn(BTN, 'bg-accent text-accent-text hover:bg-accent-hover')}
          >
            <Download size={12} />
            Download
          </button>
        </>
      )}

      <button
        onClick={onNewFile}
        className={cn(BTN, 'border border-border text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
      >
        <Upload size={12} />
        {file ? 'New file' : 'Upload'}
      </button>
    </div>
  )
}
