import { useState, useCallback, useRef, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import DOMPurify from 'dompurify'
import { normalizeSvgForDisplay } from '../utils/postprocess'

interface Props {
  svg: string
}

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.1
const ZOOM_MAX = 8

function ZoomBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-[1.88rem] py-[0.38rem] bg-transparent border-none cursor-pointer text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
    >
      {children}
    </button>
  )
}

export default function SvgPreviewPanel({ svg }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  const clean = DOMPurify.sanitize(normalizeSvgForDisplay(svg), { USE_PROFILES: { svg: true } })

  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const zoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
  }, [pan])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.mouseX),
        y: dragStart.current.panY + (e.clientY - dragStart.current.mouseY),
      })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  // Reset pan/zoom when svg changes
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [svg])

  return (
    <div className="flex-1 relative flex flex-col min-h-0 bg-surface">
      {/* Panel header */}
      <div className="shrink-0 h-9 flex items-center px-3 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">Preview</span>
      </div>

      {/* Viewport */}
      <div
        className={cn('flex-1 overflow-hidden select-none', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
        onMouseDown={onMouseDown}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
            position: 'absolute',
            top: '50%',
            left: '50%',
            willChange: 'transform',
          }}
        >
          <div
            className="[&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
            style={{ maxWidth: 560, maxHeight: 560 }}
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-px bg-surface border border-border rounded-[0.56rem] shadow-[0_0.12rem_0.5rem_rgba(0,0,0,0.12)] overflow-hidden">
        <ZoomBtn onClick={zoomOut} title="Zoom out"><ZoomOut size={13} /></ZoomBtn>
        <button
          onClick={zoomReset}
          className="px-[0.62rem] py-[0.38rem] text-[0.69rem] font-semibold text-on-surface-muted bg-transparent border-none cursor-pointer font-[inherit] hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 min-w-[2.88rem] text-center tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomBtn onClick={zoomIn} title="Zoom in"><ZoomIn size={13} /></ZoomBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ZoomBtn onClick={zoomReset} title="Reset"><Maximize2 size={12} /></ZoomBtn>
      </div>
    </div>
  )
}
