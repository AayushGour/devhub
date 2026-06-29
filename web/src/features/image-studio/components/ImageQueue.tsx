import type { ImageItem } from '../hooks/useImageStudio'
import type { OutputFormat } from '../utils/formatInfo'
import ImageQueueItem from './ImageQueueItem'
import DropZone from './DropZone'

interface Props {
  items: ImageItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onConvert: (id: string) => void
  onDownload: (id: string) => void
  onRemove: (id: string) => void
  onFormatChange: (id: string, format: OutputFormat) => void
  onQualityChange: (id: string, quality: number) => void
  onAddFiles: (files: File[]) => void
}

export default function ImageQueue({
  items, selectedId, onSelect, onConvert, onDownload, onRemove,
  onFormatChange, onQualityChange, onAddFiles,
}: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-3">
      {items.map(item => (
        <ImageQueueItem
          key={item.id}
          item={item}
          isSelected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
          onConvert={() => onConvert(item.id)}
          onDownload={() => onDownload(item.id)}
          onRemove={() => onRemove(item.id)}
          onFormatChange={format => onFormatChange(item.id, format)}
          onQualityChange={quality => onQualityChange(item.id, quality)}
        />
      ))}
      <DropZone onFiles={onAddFiles} compact />
    </div>
  )
}
