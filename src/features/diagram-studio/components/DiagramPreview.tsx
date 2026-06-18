import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MermaidTheme } from '../hooks/useDiagramEditor'

interface DiagramPreviewProps {
  code: string
  mermaidTheme: MermaidTheme
  svgRef: React.RefObject<SVGSVGElement | null>
}

let renderId = 0

const ZOOM_FACTOR = 1.25

export default function DiagramPreview({ code, mermaidTheme, svgRef }: DiagramPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const naturalDims = useRef<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fitZoom, setFitZoom] = useState(1)

  const applyZoom = useCallback((z: number) => {
    const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null
    const dims = naturalDims.current
    if (!svgEl || !dims) return
    const px = Math.round(dims.w * z)
    svgEl.setAttribute('width', `${px}`)
    svgEl.style.height = 'auto'
    setZoom(z)
  }, [])

  const zoomIn = () => applyZoom(zoom * ZOOM_FACTOR)
  const zoomOut = () => applyZoom(Math.max(0.05, zoom / ZOOM_FACTOR))
  const zoomFit = () => applyZoom(fitZoom)

  // Ctrl/Cmd + scroll wheel zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      applyZoom(Math.max(0.05, zoom * (e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [zoom, applyZoom])

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
      if (!containerRef.current || !scrollRef.current) return

      containerRef.current.innerHTML = svg
      const el = containerRef.current.querySelector('svg') as SVGSVGElement | null
      if (!el) return

      // Strip mermaid's inline max-width so we control sizing
      el.removeAttribute('style')

      // Read natural dimensions from viewBox
      const vb = el.viewBox.baseVal
      const natW = vb.width || el.getBBox().width || 600
      const natH = vb.height || el.getBBox().height || 400
      naturalDims.current = { w: natW, h: natH }

      // Calculate zoom to fit both axes
      const padH = 48
      const padV = 48
      const availW = scrollRef.current.clientWidth - padH
      const availH = scrollRef.current.clientHeight - padV
      const fit = Math.min(availW / natW, availH / natH, 1)
      setFitZoom(fit)

      // Apply fit zoom to SVG width directly (no CSS zoom quirks)
      el.setAttribute('width', `${Math.round(natW * fit)}`)
      el.style.height = 'auto'
      el.style.display = 'block'
      setZoom(fit)

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
        ref={scrollRef}
        className="flex-1 overflow-auto p-6 bg-surface"
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
          <div className="w-full max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-red-500 mb-2">
              Syntax Error
            </p>
            <pre className="text-[12px] text-red-400 bg-white/80 border border-red-200 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
              {error}
            </pre>
          </div>
        )}
        {/* Always mounted so containerRef.current is valid during render */}
        <div
          ref={containerRef}
          className={cn('diagram-preview-content', (empty || error) ? 'hidden' : '')}
        />
      </div>

      {/* Zoom controls */}
      {!empty && !error && (
        <div className="absolute bottom-4 right-4 flex items-center gap-px bg-surface border border-border rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12)] overflow-hidden">
          <ZoomBtn onClick={zoomOut} title="Zoom out (Ctrl+scroll)">
            <ZoomOut size={13} />
          </ZoomBtn>

          <button
            onClick={zoomFit}
            title="Fit to screen"
            className="px-[10px] py-[6px] text-[11px] font-semibold text-on-surface-muted bg-transparent border-none cursor-pointer font-[inherit] hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 min-w-[46px] text-center tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </button>

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
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-[30px] py-[6px] bg-transparent border-none cursor-pointer text-on-surface-muted transition-colors duration-150',
        disabled ? 'opacity-30 cursor-default' : 'hover:bg-surface-hover hover:text-on-surface'
      )}
    >
      {children}
    </button>
  )
}
