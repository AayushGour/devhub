import { useImageStudio } from './hooks/useImageStudio'
import type { OutputFormat } from './utils/formatInfo'
import ImageToolbar from './components/ImageToolbar'
import GlobalControls from './components/GlobalControls'
import ImageQueue from './components/ImageQueue'
import PreviewPanel from './components/PreviewPanel'
import DropZone from './components/DropZone'

export default function ImageStudioPage() {
  const studio = useImageStudio()
  const hasItems = studio.items.length > 0

  return (
    <div className="studio-root">
      <ImageToolbar
        doneCount={studio.items.filter(i => i.status === 'done').length}
        totalCount={studio.items.length}
        onConvertAll={studio.convertAll}
        onDownloadZip={studio.downloadZip}
        onClear={studio.clearAll}
      />

      <div className="flex flex-1 min-h-0">
        {!hasItems ? (
          <DropZone onFiles={studio.addFiles} />
        ) : (
          <>
            {/* Left: controls + queue */}
            <div className="flex flex-col w-[42%] border-r border-border min-h-0">
              <GlobalControls
                settings={studio.global}
                onChange={studio.setGlobal}
                onApplyAll={studio.applyGlobalToAll}
              />
              <ImageQueue
                items={studio.items}
                selectedId={studio.selectedId}
                onSelect={studio.setSelectedId}
                onConvert={studio.convertItem}
                onDownload={studio.downloadItem}
                onRemove={studio.removeItem}
                onFormatChange={(id, format) =>
                  studio.patchItemSettings(id, { outputFormat: format as OutputFormat })
                }
                onQualityChange={(id, quality) =>
                  studio.patchItemSettings(id, { quality })
                }
                onAddFiles={studio.addFiles}
              />
            </div>

            {/* Right: preview */}
            <PreviewPanel
              item={studio.selectedItem}
              viewMode={studio.viewMode}
              onViewModeChange={studio.setViewMode}
            />
          </>
        )}
      </div>
    </div>
  )
}
