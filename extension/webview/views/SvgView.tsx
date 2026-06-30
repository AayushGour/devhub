import SvgPreviewPanel from '@/features/svg-studio/components/SvgPreviewPanel'
import { exportPDFViaHost } from '../utils/print'
import { FileImage, Printer } from 'lucide-react'

function downloadSvg(text: string) {
  const blob = new Blob([text], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'image.svg'; a.click()
  URL.revokeObjectURL(url)
}

export default function SvgView({ text }: { text: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center px-3 h-9 border-b border-border bg-surface-raised">
        <div className="ml-auto flex items-center gap-0.5">
          <button
            data-tooltip="Export SVG"
            onClick={() => downloadSvg(text)}
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
          >
            <FileImage size={14} />
          </button>
          <button
            data-tooltip="Export PDF"
            onClick={() => exportPDFViaHost(
              `<!DOCTYPE html><html><head><title>Image</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;justify-content:center;padding:20mm;}@page{margin:20mm;}svg{max-width:100%;height:auto;}</style></head><body>${text}</body></html>`,
              'image',
            )}
            className="p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
          >
            <Printer size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <SvgPreviewPanel svg={text} showHeader={false} />
      </div>
    </div>
  )
}
