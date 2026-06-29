import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useSvgStudio } from './hooks/useSvgStudio'
import SvgToolbar from './components/SvgToolbar'
import UploadZone from './components/UploadZone'
import Gallery from './components/Gallery'
import RefinePanel from './components/RefinePanel'
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
        activeLabel={studio.phase === 'done' ? studio.activePreset?.label ?? null : null}
        activeSvg={studio.phase === 'done' ? studio.activeSvg : null}
        showBack={studio.phase === 'done'}
        onNewFile={triggerUpload}
        onBackToGallery={studio.backToGallery}
      />

      <div className="flex flex-1 min-h-0">
        {studio.phase === 'idle' && (
          <UploadZone onFile={studio.handleFile} error={studio.error} />
        )}

        {studio.phase === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 size={28} className="text-accent animate-spin" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[0.88rem] font-medium text-on-surface">Loading image…</span>
              <span className="text-[0.75rem] text-on-surface-muted">Preparing tracers</span>
            </div>
          </div>
        )}

        {studio.phase === 'gallery' && (
          <Gallery
            presets={studio.presets}
            tiles={studio.tiles}
            activeId={studio.activeId}
            onSelect={studio.selectTile}
          />
        )}

        {studio.phase === 'done' && studio.activeSvg && studio.activePreset && (
          <>
            <SvgCodePanel svg={studio.activeSvg} onChange={studio.editSvg} />
            <SvgPreviewPanel svg={studio.activeSvg} />
            <RefinePanel
              preset={studio.activePreset}
              params={studio.params[studio.activePreset.id] ?? {}}
              refining={studio.refining}
              onChange={(knobId, value) => studio.refine(studio.activePreset!.id, knobId, value)}
            />
          </>
        )}
      </div>
    </div>
  )
}
