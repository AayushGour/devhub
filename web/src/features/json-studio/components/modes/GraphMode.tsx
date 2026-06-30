import { useMemo, useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { ZoomIn, ZoomOut, Maximize2, FileImage, Printer, FileCode } from 'lucide-react'
import { toPng, toSvg } from 'html-to-image'
import { cn } from '@/lib/utils'
import { buildGraph, EXPORT_NODE_WIDTH, NODE_WIDTH, SPACING_X, CANVAS_PAD, NODE_HEADER_H, NODE_ROW_H } from '../../utils/graphLayout'
import type { GNode, GraphLayout } from '../../utils/graphLayout'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

export interface GraphModeHandle {
  exportPng: () => Promise<void>
  exportPdf: () => Promise<void>
  exportHtml: () => Promise<void>
}

type Props = Pick<JsonStudioState, 'input'> & {
  onExportPdf?: (html: string, filename: string) => void
  onExportHtml?: (html: string, filename: string) => void
}

const VALUE_CLASS: Record<GNode['rows'][0]['valueType'], string> = {
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-bool',
  null: 'text-json-null',
  object: 'text-on-surface-muted italic',
  array: 'text-accent/70 italic',
}

interface TooltipState {
  text: string
  anchorRect: DOMRect
}

function GraphTooltip({ text, anchorRect }: TooltipState) {
  const ref = useRef<HTMLDivElement>(null)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    setFlipped(anchorRect.top - ref.current.offsetHeight - 12 < 0)
  }, [anchorRect, text])

  const left = anchorRect.left + anchorRect.width / 2
  const top = flipped ? anchorRect.bottom + 8 : anchorRect.top - 8

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        transform: flipped ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div className="relative bg-[rgba(0,0,0,0.85)] text-white text-[0.72rem] leading-snug rounded-md px-2 py-[5px] max-w-[18rem] break-all font-mono shadow-lg whitespace-pre-wrap">
        {text}
        <div
          className="absolute left-1/2 w-2 h-2 bg-[rgba(0,0,0,0.85)]"
          style={{
            [flipped ? 'top' : 'bottom']: -4,
            transform: 'translateX(-50%) rotate(45deg)',
          }}
        />
      </div>
    </div>
  )
}

function EdgePath({ from, to, edgeLabel, nodes }: { from: string; to: string; edgeLabel: string | null; nodes: Map<string, GNode> }) {
  const src = nodes.get(from)!
  const dst = nodes.get(to)!
  const x1 = src.x + src.width
  const rowIndex = edgeLabel != null ? src.rows.findIndex(r => r.key === edgeLabel) : -1
  const y1 = rowIndex >= 0
    ? src.y + NODE_HEADER_H + rowIndex * NODE_ROW_H + NODE_ROW_H / 2
    : src.y + src.height / 2
  const x2 = dst.x
  const y2 = dst.y + dst.height / 2
  const mid = (x1 + x2) / 2
  return (
    <path
      d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
      fill="none"
      stroke="var(--border)"
      strokeWidth="1.5"
    />
  )
}

const INDEX_LABEL_RE = /^\[\d+\]$/

function NodeCard({ node }: { node: GNode }) {
  const isArr = node.nodeType === 'array'
  const isIndexLabel = node.edgeLabel ? INDEX_LABEL_RE.test(node.edgeLabel) : false

  return (
    <div
      data-node-id={node.id}
      className={cn(
        'absolute bg-surface rounded-[0.62rem] overflow-hidden border',
        isArr ? 'border-accent/40' : 'border-border',
      )}
      style={{ left: node.x, top: node.y, width: node.width }}
    >
      {/* Header */}
      <div
        className={cn(
          'h-[2.12rem] px-3 flex items-center gap-1.5 border-b shrink-0',
          isArr ? 'bg-accent/8 border-accent/25' : 'bg-surface-raised border-border',
        )}
      >
        <span
          className={cn(
            'text-[0.62rem] font-bold font-mono shrink-0',
            isArr ? 'text-accent' : 'text-on-surface-muted',
          )}
        >
          {isArr ? '[ ]' : '{ }'}
        </span>
        <span className="text-[0.69rem] font-semibold text-on-surface tracking-[-0.01rem] flex-1 truncate">
          {node.title}
        </span>
        {node.edgeLabel && (
          <span
            data-tooltip={node.edgeLabel}
            className={cn(
              'text-[0.62rem] font-mono font-medium rounded-full px-[0.44rem] py-[0.06rem] shrink-0 truncate max-w-[5rem] border',
              isIndexLabel
                ? 'text-accent bg-accent/10 border-accent/30'
                : 'text-accent bg-surface border-border',
            )}
          >
            {node.edgeLabel}
          </span>
        )}
      </div>

      {/* Rows */}
      {isArr
        ? node.rows.map((row, i) => {
            const isNested = row.valueType === 'object' || row.valueType === 'array'
            const displayIdx = row.key.replace(/^\[(\d+)\]$/, '$1')
            return (
              <div
                key={i}
                className="flex items-center px-3 gap-2 border-b border-border last:border-0"
                style={{ height: 24 }}
              >
                <span className="text-[0.62rem] font-mono text-accent/60 shrink-0 w-6 text-right">
                  {displayIdx}
                </span>
                <span
                  {...(!isNested && row.rawValue ? { 'data-tooltip': row.rawValue } : {})}
                  {...(!isNested ? { 'data-export-value': row.valueType === 'string' ? `"${row.rawValue}"` : row.rawValue } : { 'data-export-value': row.value })}
                  className={cn('text-[0.69rem] font-mono truncate', VALUE_CLASS[row.valueType])}
                >
                  {row.value}
                </span>
              </div>
            )
          })
        : node.rows.map((row, i) => {
            const isNested = row.valueType === 'object' || row.valueType === 'array'
            return (
              <div
                key={i}
                className="flex items-center px-3 border-b border-border last:border-0"
                style={{ height: 24 }}
              >
                <span className="text-[0.69rem] text-on-surface-muted shrink-0 mr-2 font-mono max-w-[5.62rem] truncate">
                  {row.key}
                </span>
                <span
                  {...(!isNested && row.rawValue ? { 'data-tooltip': row.rawValue } : {})}
                  {...(!isNested ? { 'data-export-value': row.valueType === 'string' ? `"${row.rawValue}"` : row.rawValue } : { 'data-export-value': row.value })}
                  className={cn('text-[0.69rem] font-mono ml-auto truncate max-w-25', VALUE_CLASS[row.valueType])}
                >
                  {row.value}
                </span>
              </div>
            )
          })}
    </div>
  )
}

// forwardRef so GraphMode can grab the natural-size div for PNG capture
const Graph = forwardRef<HTMLDivElement, { layout: GraphLayout }>(({ layout }, ref) => {
  const edges: { from: string; to: string; edgeLabel: string }[] = []
  for (const node of layout.nodes.values()) {
    for (const edge of node.childEdges) {
      edges.push({ from: node.id, to: edge.childId, edgeLabel: edge.label })
    }
  }

  return (
    <div
      ref={ref}
      className="relative"
      style={{ width: layout.totalWidth, height: layout.totalHeight }}
    >
      <svg
        className="absolute inset-0 pointer-events-none"
        width={layout.totalWidth}
        height={layout.totalHeight}
      >
        {edges.map(e => (
          <EdgePath key={`${e.from}-${e.to}`} from={e.from} to={e.to} edgeLabel={e.edgeLabel} nodes={layout.nodes} />
        ))}
      </svg>

      {[...layout.nodes.values()].map(node => (
        <NodeCard key={node.id} node={node} />
      ))}
    </div>
  )
})
Graph.displayName = 'Graph'

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.01
const ZOOM_MAX = 4.0

function buildExportClone(
  sourceEl: HTMLDivElement,
  layout?: GraphLayout | null,
  exportNodeWidth = NODE_WIDTH,
): { clone: HTMLDivElement; cleanup: () => void } {
  const clone = sourceEl.cloneNode(true) as HTMLDivElement

  // Replace truncated display values with full formatted values
  // Also fix flex layout so values wrap instead of overflowing
  clone.querySelectorAll<HTMLElement>('[data-export-value]').forEach(el => {
    el.textContent = el.getAttribute('data-export-value')!
    el.style.flex = '1'
    el.style.minWidth = '0'
    el.style.wordBreak = 'break-all'
    el.style.overflowWrap = 'break-word'
    el.style.marginLeft = '0'
  })

  // Strip CSS truncation / max-width / ml-auto so full text is visible and wraps
  clone.querySelectorAll<Element>('*').forEach(el => {
    const cls = el.getAttribute('class')
    if (cls) {
      el.setAttribute('class', cls
        .replace(/\btruncate\b/g, '')
        .replace(/\bmax-w-\S+/g, '')
        .replace(/\bml-auto\b/g, '')
        .trim()
      )
    }
  })

  // Remove overflow-hidden from cards so expanded rows aren't clipped
  clone.querySelectorAll<HTMLElement>('.overflow-hidden').forEach(el => {
    const cls = el.getAttribute('class') || ''
    el.setAttribute('class', cls.replace(/\boverflow-hidden\b/g, '').trim())
  })

  // Make fixed-height rows auto so wrapped text is fully visible
  clone.querySelectorAll<HTMLElement>('[style]').forEach(el => {
    if (el.style.height === '24px') {
      el.style.height = 'auto'
      el.style.minHeight = '24px'
    }
  })

  // Expand node boxes and recompute positions so values up to 350 chars fit on one line
  if (layout && exportNodeWidth > NODE_WIDTH) {
    // Compute new x for each node based on its column level
    const nodeNewX = new Map<string, number>()
    for (const [id, node] of layout.nodes) {
      const level = Math.round((node.x - CANVAS_PAD) / (NODE_WIDTH + SPACING_X))
      nodeNewX.set(id, CANVAS_PAD + level * (exportNodeWidth + SPACING_X))
    }

    // Patch each node card's left + width
    clone.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
      const id = el.getAttribute('data-node-id')!
      const newX = nodeNewX.get(id)
      if (newX !== undefined) {
        el.style.left = `${newX}px`
        el.style.width = `${exportNodeWidth}px`
      }
    })

    // Compute new canvas width
    let maxX = 0
    for (const [id] of layout.nodes) {
      maxX = Math.max(maxX, (nodeNewX.get(id) ?? 0) + exportNodeWidth)
    }
    const newTotalWidth = maxX + CANVAS_PAD
    clone.style.width = `${newTotalWidth}px`

    // Regenerate SVG paths with updated coordinates
    const svgEl = clone.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', String(newTotalWidth))
      svgEl.querySelectorAll('path').forEach(p => p.remove())
      for (const node of layout.nodes.values()) {
        for (const edge of node.childEdges) {
          const dst = layout.nodes.get(edge.childId)!
          const x1 = (nodeNewX.get(node.id) ?? 0) + exportNodeWidth
          const rowIndex = node.rows.findIndex(r => r.key === edge.label)
          const y1 = rowIndex >= 0
            ? node.y + NODE_HEADER_H + rowIndex * NODE_ROW_H + NODE_ROW_H / 2
            : node.y + node.height / 2
          const x2 = nodeNewX.get(dst.id) ?? 0
          const y2 = dst.y + dst.height / 2
          const mid = (x1 + x2) / 2
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', 'var(--border)')
          path.setAttribute('stroke-width', '1.5')
          svgEl.appendChild(path)
        }
      }
    }
  }

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;top:-99999px;left:-99999px;pointer-events:none'
  host.appendChild(clone)
  document.body.appendChild(host)
  return { clone, cleanup: () => document.body.removeChild(host) }
}

const GraphMode = forwardRef<GraphModeHandle, Props>(function GraphMode({ input, onExportPdf, onExportHtml }, ref) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const fitZoomRef = useRef(1)
  const fitPanRef = useRef({ x: 0, y: 0 })

  const { layout, error } = useMemo(() => {
    if (!input.trim()) return { layout: null, error: null }
    try {
      const value = JSON.parse(input)
      return { layout: buildGraph(value), error: null }
    } catch (e) {
      return { layout: null, error: (e as Error).message }
    }
  }, [input])

  // Compute + apply fit zoom whenever layout changes
  useEffect(() => {
    if (!layout || !viewportRef.current) return
    const { clientWidth: vpW, clientHeight: vpH } = viewportRef.current
    const padding = 48
    const fit = Math.min(
      (vpW - padding) / layout.totalWidth,
      (vpH - padding) / layout.totalHeight,
      1,
    )
    const px = (vpW - layout.totalWidth * fit) / 2
    const py = (vpH - layout.totalHeight * fit) / 2
    fitZoomRef.current = fit
    fitPanRef.current = { x: px, y: py }
    setZoom(fit)
    setPan({ x: px, y: py })
    zoomRef.current = fit
    panRef.current = { x: px, y: py }
  }, [layout])

  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const zoomReset = () => {
    const fz = fitZoomRef.current
    const fp = fitPanRef.current
    setZoom(fz)
    setPan(fp)
    zoomRef.current = fz
    panRef.current = fp
  }

  // Keep refs in sync so wheel handler reads latest without re-binding
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  // Canvas max texture size — exceeding this causes silent downsampling (blur).
  // Keep output within 8192px on the longest side; still 2× for small graphs.
  const captureRatio = useCallback((el: HTMLDivElement) => {
    const MAX = 8192
    return Math.min(2, MAX / el.offsetWidth, MAX / el.offsetHeight)
  }, [])

  // PNG export — full-fidelity: removes CSS truncation + expands 24-char value limit before capture
  const exportPng = useCallback(async () => {
    if (!graphRef.current || isExporting) return
    setIsExporting(true)
    const { clone, cleanup } = buildExportClone(graphRef.current, layout, EXPORT_NODE_WIDTH)
    try {
      const dataUrl = await toPng(clone, { pixelRatio: captureRatio(clone) })
      const blob = await fetch(dataUrl).then(r => r.blob())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'graph.png'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      cleanup()
      setIsExporting(false)
    }
  }, [isExporting, captureRatio, layout])

  // PDF export — same full-fidelity clone, embedded as PNG in a print-ready HTML page
  const exportPdf = useCallback(async () => {
    if (!graphRef.current || isExporting) return
    setIsExporting(true)
    const { clone, cleanup } = buildExportClone(graphRef.current, layout, EXPORT_NODE_WIDTH)
    try {
      const dataUrl = await toPng(clone, { pixelRatio: captureRatio(clone) })
      const html =
        `<!DOCTYPE html><html><head><title>Graph</title><style>` +
        `*{margin:0;padding:0;box-sizing:border-box;}` +
        `body{display:flex;justify-content:center;align-items:flex-start;padding:20mm;}` +
        `img{max-width:100%;height:auto;}` +
        `@page{margin:20mm;size:auto;}` +
        `</style></head><body><img src="${dataUrl}"/></body></html>`
      if (onExportPdf) {
        onExportPdf(html, 'graph')
      } else {
        const win = window.open('', '_blank')
        if (!win) return
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => win.print(), 250)
      }
    } finally {
      cleanup()
      setIsExporting(false)
    }
  }, [isExporting, onExportPdf, captureRatio, layout])

  // HTML export — vector SVG via expanded clone; no pixel limits, infinitely zoomable
  const exportHtml = useCallback(async () => {
    if (!graphRef.current || isExporting) return
    setIsExporting(true)
    const { clone, cleanup } = buildExportClone(graphRef.current, layout, EXPORT_NODE_WIDTH)
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
      const svgDataUrl = await toSvg(clone, { backgroundColor: bg || 'transparent' })
      const svgStr = decodeURIComponent(svgDataUrl.split(',').slice(1).join(','))
      const html =
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Graph</title><style>` +
        `*{margin:0;padding:0;box-sizing:border-box;}` +
        `body{background:${bg || '#fff'};display:flex;justify-content:center;padding:24px;min-height:100vh;}` +
        `svg{max-width:100%;height:auto;}` +
        `</style></head><body>${svgStr}</body></html>`
      if (onExportHtml) {
        onExportHtml(html, 'graph')
      } else {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'graph.html'; a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      cleanup()
      setIsExporting(false)
    }
  }, [isExporting, onExportHtml, layout])

  // Tooltip: event delegation on viewport
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null
      if (!target) return
      setTooltip({ text: target.getAttribute('data-tooltip')!, anchorRect: target.getBoundingClientRect() })
    }

    const onOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null
      if (!target) return
      const related = e.relatedTarget as HTMLElement | null
      if (!related || !target.contains(related)) setTooltip(null)
    }

    el.addEventListener('mouseover', onOver)
    el.addEventListener('mouseout', onOut)
    return () => {
      el.removeEventListener('mouseover', onOver)
      el.removeEventListener('mouseout', onOut)
    }
  }, [])

  // Wheel/trackpad
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setTooltip(null)
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const factor = Math.pow(0.995, e.deltaY)
        const curZoom = zoomRef.current
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, curZoom * factor))
        const ratio = newZoom / curZoom
        const curPan = panRef.current
        const newPan = {
          x: cx - (cx - curPan.x) * ratio,
          y: cy - (cy - curPan.y) * ratio,
        }
        zoomRef.current = newZoom
        panRef.current = newPan
        setZoom(newZoom)
        setPan(newPan)
      } else {
        const curPan = panRef.current
        const newPan = { x: curPan.x - e.deltaX, y: curPan.y - e.deltaY }
        panRef.current = newPan
        setPan(newPan)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setTooltip(null)
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

  useImperativeHandle(ref, () => ({ exportPng, exportPdf, exportHtml }), [exportPng, exportPdf, exportHtml])

  return (
    <div className="flex-1 relative flex flex-col min-h-0 min-w-0 bg-surface">
      {/* Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden select-none"
        onMouseDown={onMouseDown}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {!input.trim() && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[0.75rem] text-on-surface-muted">Enter JSON to view graph</p>
          </div>
        )}

        {error && (
          <div className="p-6">
            <p className="text-[0.75rem] text-red-500 font-mono bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          </div>
        )}

        {layout && (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
              width: layout.totalWidth,
              height: layout.totalHeight,
              willChange: 'transform',
            }}
          >
            <Graph ref={graphRef} layout={layout} />
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && <GraphTooltip text={tooltip.text} anchorRect={tooltip.anchorRect} />}

      {/* Zoom + export controls */}
      {layout && (
        <div className="absolute bottom-4 right-4 flex items-center gap-px bg-surface border border-border rounded-[0.56rem] shadow-[0_0.12rem_0.5rem_rgba(0,0,0,0.12)] overflow-hidden">
          <ZoomBtn onClick={zoomOut} title="Zoom out">
            <ZoomOut size={13} />
          </ZoomBtn>
          <button
            onClick={zoomReset}
            className="px-[0.62rem] py-[0.38rem] text-[0.69rem] font-semibold text-on-surface-muted bg-transparent border-none cursor-pointer font-[inherit] hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 min-w-[2.88rem] text-center tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ZoomBtn onClick={zoomIn} title="Zoom in">
            <ZoomIn size={13} />
          </ZoomBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <ZoomBtn onClick={zoomReset} title="Reset zoom">
            <Maximize2 size={12} />
          </ZoomBtn>
          <div className="w-px h-4 bg-border mx-0.5" />
          <ZoomBtn onClick={exportPng} title="Export PNG" disabled={isExporting}>
            <FileImage size={13} />
          </ZoomBtn>
          <ZoomBtn onClick={exportPdf} title="Export PDF" disabled={isExporting}>
            <Printer size={13} />
          </ZoomBtn>
          <ZoomBtn onClick={exportHtml} title="Export HTML" disabled={isExporting}>
            <FileCode size={13} />
          </ZoomBtn>
        </div>
      )}

      {/* Node count */}
      {layout && (
        <div className="absolute top-3 left-3 text-[0.69rem] font-medium text-on-surface-muted bg-surface border border-border rounded-full px-3 py-1">
          {layout.nodes.size} node{layout.nodes.size !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
})
GraphMode.displayName = 'GraphMode'

export default GraphMode

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
        'flex items-center justify-center w-[1.88rem] py-[0.38rem] bg-transparent border-none cursor-pointer text-on-surface-muted transition-colors duration-150',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-hover hover:text-on-surface',
      )}
    >
      {children}
    </button>
  )
}
