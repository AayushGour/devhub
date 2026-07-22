import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import type { MermaidTheme } from '../hooks/useDiagramEditor'

interface DiagramPreviewProps {
  code: string
  mermaidTheme: MermaidTheme
  svgRef: React.RefObject<SVGSVGElement | null>
}

let renderId = 0

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.01
const ZOOM_MAX = 8

export default function DiagramPreview({ code, mermaidTheme, svgRef }: DiagramPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const naturalDims = useRef<{ w: number; h: number } | null>(null)
  const fitZoomRef = useRef(1)

  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })

  // Keep refs in sync for wheel handler
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  const zoomTo = useCallback((z: number, origin?: { cx: number; cy: number }) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
    if (origin) {
      const ratio = clamped / zoomRef.current
      const cur = panRef.current
      const newPan = {
        x: origin.cx - (origin.cx - cur.x) * ratio,
        y: origin.cy - (origin.cy - cur.y) * ratio,
      }
      zoomRef.current = clamped
      panRef.current = newPan
      setZoom(clamped)
      setPan(newPan)
    } else {
      setZoom(clamped)
    }
  }, [])

  const zoomIn = () => zoomTo(zoomRef.current * ZOOM_STEP)
  const zoomOut = () => zoomTo(zoomRef.current / ZOOM_STEP)
  const zoomFit = useCallback(() => {
    setZoom(fitZoomRef.current)
    setPan({ x: 0, y: 0 })
    zoomRef.current = fitZoomRef.current
    panRef.current = { x: 0, y: 0 }
  }, [])

  // Drag-to-pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const newPan = {
        x: dragStart.current.panX + (e.clientX - dragStart.current.mouseX),
        y: dragStart.current.panY + (e.clientY - dragStart.current.mouseY),
      }
      panRef.current = newPan
      setPan(newPan)
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  // Ctrl+scroll / pinch-to-zoom
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      const factor = Math.pow(0.995, e.deltaY)
      zoomTo(zoomRef.current * factor, { cx, cy })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [zoomTo])

  const render = useCallback(async () => {
    const trimmed = code.trim()
    if (!trimmed) { setEmpty(true); setError(null); return }
    setEmpty(false)

    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'antiscript',
      fontFamily: 'system-ui, sans-serif',
    })

    const id = `devhub-dgm-${++renderId}`
    try {
      const { svg } = await mermaid.render(id, trimmed)
      if (!containerRef.current || !viewportRef.current) return

      containerRef.current.innerHTML = svg
      const el = containerRef.current.querySelector('svg') as SVGSVGElement | null
      if (!el) return

      el.removeAttribute('style')
      el.removeAttribute('width')
      el.removeAttribute('height')
      el.style.display = 'block'

      const vb = el.viewBox.baseVal
      const natW = vb.width || el.getBBox().width || 600
      const natH = vb.height || el.getBBox().height || 400
      naturalDims.current = { w: natW, h: natH }

      // Set SVG intrinsic size via attributes so CSS transform scale works predictably
      el.setAttribute('width', `${natW}`)
      el.setAttribute('height', `${natH}`)

      const availW = viewportRef.current.clientWidth - 64
      const availH = viewportRef.current.clientHeight - 64
      const fit = Math.min(availW / natW, availH / natH, 1)
      fitZoomRef.current = fit

      setZoom(fit)
      setPan({ x: 0, y: 0 })
      zoomRef.current = fit
      panRef.current = { x: 0, y: 0 }

      ;(svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el
      setError(null)
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e)
      setError(raw.replace(/<[^>]+>/g, '').trim() || 'Syntax error in diagram')
      if (containerRef.current) containerRef.current.innerHTML = ''
      ;(svgRef as React.MutableRefObject<SVGSVGElement | null>).current = null
    }
  }, [code, mermaidTheme, svgRef])

  useEffect(() => {
    const t = setTimeout(render, 400)
    return () => clearTimeout(t)
  }, [render])

  return (
    <div className="flex-1 min-w-0 relative flex flex-col border-l border-border">
      <div
        ref={viewportRef}
        className={cn(
          'flex-1 relative overflow-hidden select-none',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={onMouseDown}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {empty && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-on-surface-muted">Start typing a diagram&hellip;</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-start p-6">
            <div className="w-full max-w-lg">
              <p className="text-[0.69rem] font-semibold uppercase tracking-[0.06em] text-red-500 mb-2">
                Syntax Error
              </p>
              <pre className="text-[0.75rem] text-red-400 bg-white/80 border border-red-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
                {error}
              </pre>
            </div>
          </div>
        )}
        {/* Centered transform wrapper */}
        <div
          className={cn('diagram-preview-content', (empty || error) ? 'hidden' : '')}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
          ref={containerRef}
        />
      </div>

      {/* Zoom controls */}
      {!empty && !error && (
        <div className="absolute bottom-4 right-4 flex items-center gap-px bg-surface border border-border rounded-lg shadow-[0_0.12rem_0.5rem_rgba(0,0,0,0.12)] overflow-hidden">
          <ZoomBtn onClick={zoomOut} title="Zoom out (Ctrl+scroll)">
            <ZoomOut size={13} />
          </ZoomBtn>
          <Tooltip content="Fit to screen">
            <button
              onClick={zoomFit}
              className="px-[0.62rem] py-[0.38rem] text-[0.69rem] font-semibold text-on-surface-muted bg-transparent border-none cursor-pointer font-[inherit] hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 min-w-[2.88rem] text-center tabular-nums"
            >
              {Math.round(zoom * 100)}%
            </button>
          </Tooltip>
          <ZoomBtn onClick={zoomIn} title="Zoom in (Ctrl+scroll)">
            <ZoomIn size={13} />
          </ZoomBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <ZoomBtn onClick={zoomFit} title="Fit diagram to screen">
            <Maximize2 size={12} />
          </ZoomBtn>
        </div>
      )}
    </div>
  )
}

function ZoomBtn({ children, onClick, title, disabled }: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <Tooltip content={title}>
      <button
        onClick={onClick}
        aria-label={title}
        disabled={disabled}
        className={cn(
          'flex items-center justify-center w-[1.88rem] py-[0.38rem] bg-transparent border-none cursor-pointer text-on-surface-muted transition-colors duration-150',
          disabled ? 'opacity-30 cursor-default' : 'hover:bg-surface-hover hover:text-on-surface',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}
