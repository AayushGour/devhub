import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import DOMPurify from 'dompurify'
import { normalizeSvgForDisplay } from '../utils/postprocess'

interface Props {
  svg: string
  showHeader?: boolean
}

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.01
const ZOOM_MAX = 32

function ZoomBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <Tooltip content={title}>
      <button
        onClick={onClick}
        aria-label={title}
        className="flex items-center justify-center w-[1.88rem] py-[0.38rem] bg-transparent border-none cursor-pointer text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150"
      >
        {children}
      </button>
    </Tooltip>
  )
}

export default function SvgPreviewPanel({ svg, showHeader = true }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgElRef = useRef<SVGSVGElement | null>(null)
  const naturalDims = useRef<{ w: number; h: number } | null>(null)
  const fitZoomRef = useRef(1)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  // Tracks whether fit has been applied for the current SVG.
  // Separate from naturalDims so the ResizeObserver fallback fires correctly even when
  // naturalDims is set but the viewport was 0-sized at the time.
  const hasFitRef = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  const clean = useMemo(
    () => DOMPurify.sanitize(normalizeSvgForDisplay(svg), { USE_PROFILES: { svg: true, svgFilters: true } }),
    [svg],
  )

  // Zoom by mutating SVG width/height attributes so the browser re-rasterizes the SVG
  // at the target resolution on every zoom step (no GPU-layer bitmap stretching).
  const applyZoom = useCallback((z: number, cursorCenter?: { cx: number; cy: number }) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
    const el = svgElRef.current
    const dims = naturalDims.current
    if (el && dims) {
      el.setAttribute('width', String(Math.round(dims.w * clamped)))
      el.setAttribute('height', String(Math.round(dims.h * clamped)))
    }
    if (cursorCenter) {
      const ratio = clamped / zoomRef.current
      const cur = panRef.current
      const newPan = {
        x: cursorCenter.cx * (1 - ratio) + cur.x * ratio,
        y: cursorCenter.cy * (1 - ratio) + cur.y * ratio,
      }
      panRef.current = newPan
      setPan(newPan)
    }
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])

  const zoomIn = () => applyZoom(zoomRef.current * ZOOM_STEP)
  const zoomOut = () => applyZoom(zoomRef.current / ZOOM_STEP)

  const zoomFit = useCallback(() => {
    const fz = fitZoomRef.current
    const el = svgElRef.current
    const dims = naturalDims.current
    if (el && dims) {
      el.setAttribute('width', String(Math.round(dims.w * fz)))
      el.setAttribute('height', String(Math.round(dims.h * fz)))
    }
    zoomRef.current = fz
    panRef.current = { x: 0, y: 0 }
    setZoom(fz)
    setPan({ x: 0, y: 0 })
  }, [])

  // Compute fit zoom from current naturalDims + viewport size and apply it.
  const applyFitZoom = useCallback(() => {
    if (!viewportRef.current) return
    const el = svgElRef.current
    const dims = naturalDims.current
    if (!el || !dims) return

    const padding = 64
    const vpW = viewportRef.current.clientWidth - padding
    const vpH = viewportRef.current.clientHeight - padding
    if (vpW <= 0 || vpH <= 0) return

    const fit = Math.max(ZOOM_MIN, Math.min(vpW / dims.w, vpH / dims.h))
    fitZoomRef.current = fit

    el.setAttribute('width', String(Math.round(dims.w * fit)))
    el.setAttribute('height', String(Math.round(dims.h * fit)))
    zoomRef.current = fit
    panRef.current = { x: 0, y: 0 }
    hasFitRef.current = true
    setZoom(fit)
    setPan({ x: 0, y: 0 })
  }, [])

  // When SVG content changes: set innerHTML imperatively so React re-renders can't reset
  // the SVG attributes we mutate for zoom. Read natural dims from viewBox, set them once
  // as the baseline, then compute fit zoom via RAF (after layout completes).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    hasFitRef.current = false
    svgElRef.current = null
    naturalDims.current = null

    if (!clean) {
      el.innerHTML = ''
      return
    }

    el.innerHTML = clean

    const svgEl = el.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return
    svgElRef.current = svgEl

    const vb = svgEl.viewBox.baseVal
    let natW = vb.width
    let natH = vb.height
    if (!natW || !natH) {
      try {
        const bb = svgEl.getBBox()
        natW = bb.width
        natH = bb.height
      } catch {
        // SVG not yet in render tree
      }
    }
    natW = natW || 300
    natH = natH || 150
    naturalDims.current = { w: natW, h: natH }
    svgEl.style.display = 'block'

    const raf = requestAnimationFrame(applyFitZoom)
    return () => cancelAnimationFrame(raf)
  }, [clean, applyFitZoom])

  // Fallback for VSCode webviews: viewport may be 0-sized when the RAF fires.
  // hasFitRef (not naturalDims) guards this so the fallback fires even after naturalDims
  // is set from a prior RAF that found a 0-sized viewport.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (hasFitRef.current) return
      applyFitZoom()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyFitZoom])

  // Ctrl+scroll / pinch-to-zoom — zoom toward cursor
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
      applyZoom(zoomRef.current * factor, { cx, cy })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [applyZoom])

  // Drag-to-pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    }
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

  return (
    <div className="flex-1 relative flex flex-col min-h-0 bg-surface">
      {showHeader && (
        <div className="shrink-0 h-9 flex items-center px-3 border-b border-border bg-surface-raised">
          <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
            Preview
          </span>
        </div>
      )}

      {/* Viewport — SVG width/height attributes handle zoom; translate-only CSS for pan */}
      <div
        ref={viewportRef}
        className={cn(
          'flex-1 overflow-hidden select-none',
          isDragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={onMouseDown}
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
            willChange: 'transform',
          }}
        >
          <div ref={containerRef} />
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-px bg-surface border border-border rounded-[0.56rem] shadow-[0_0.12rem_0.5rem_rgba(0,0,0,0.12)] overflow-hidden">
        <ZoomBtn onClick={zoomOut} title="Zoom out (Ctrl+scroll)">
          <ZoomOut size={13} />
        </ZoomBtn>
        <button
          onClick={zoomFit}
          className="px-[0.62rem] py-[0.38rem] text-[0.69rem] font-semibold text-on-surface-muted bg-transparent border-none cursor-pointer font-[inherit] hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 min-w-[2.88rem] text-center tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ZoomBtn onClick={zoomIn} title="Zoom in (Ctrl+scroll)">
          <ZoomIn size={13} />
        </ZoomBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ZoomBtn onClick={zoomFit} title="Fit to screen">
          <Maximize2 size={12} />
        </ZoomBtn>
      </div>
    </div>
  )
}
