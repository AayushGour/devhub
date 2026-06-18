import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useSvgStudio } from './hooks/useSvgStudio'
import SvgToolbar from './components/SvgToolbar'
import UploadZone from './components/UploadZone'
import CompareModal from './components/CompareModal'
import SvgCodePanel from './components/SvgCodePanel'
import SvgPreviewPanel from './components/SvgPreviewPanel'

export default function SvgStudioPage() {
  const studio = useSvgStudio()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function triggerUpload() {
    fileInputRef.current?.click()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) studio.handleFile(file)
    e.target.value = ''
  }

  return (
    <div className="studio-root">
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        className="sr-only"
        onChange={handleInputChange}
      />

      <SvgToolbar
        file={studio.file}
        activeLabel={studio.activeLabel}
        activeSvg={studio.activeSvg}
        hasCompare={!!studio.compare}
        onNewFile={triggerUpload}
        onSwitchToEmbed={studio.switchToEmbed}
        onSwitchToVector={studio.switchToVector}
      />

      <div className="flex flex-1 min-h-0">
        {studio.phase === 'idle' && (
          <UploadZone onFile={studio.handleFile} error={studio.error} />
        )}

        {studio.phase === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 size={28} className="text-accent animate-spin" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[14px] font-medium text-on-surface">Converting…</span>
              <span className="text-[12px] text-on-surface-muted">Running detailed and simplified tracers in parallel</span>
            </div>
          </div>
        )}

        {studio.phase === 'done' && studio.activeSvg && (
          <>
            <SvgCodePanel svg={studio.activeSvg} onChange={studio.editSvg} />
            <SvgPreviewPanel svg={studio.activeSvg} />
          </>
        )}
      </div>

      {studio.phase === 'comparing' && studio.compare && (
        <CompareModal
          a={studio.compare.a}
          b={studio.compare.b}
          onSelect={studio.selectMethod}
        />
      )}
    </div>
  )
}
