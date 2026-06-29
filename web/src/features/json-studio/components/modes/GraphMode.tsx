import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildGraph } from '../../utils/graphLayout'
import type { GNode, GraphLayout } from '../../utils/graphLayout'
import type { JsonStudioState } from '../../hooks/useJsonStudio'

type Props = Pick<JsonStudioState, 'input'>

const VALUE_CLASS: Record<GNode['rows'][0]['valueType'], string> = {
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-bool',
  null: 'text-json-null',
}

function EdgePath({ from, to, nodes }: { from: string; to: string; nodes: Map<string, GNode> }) {
  const src = nodes.get(from)!
  const dst = nodes.get(to)!
  const x1 = src.x + src.width
  const y1 = src.y + src.height / 2
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
        ? node.rows.map((row, i) => (
            <div
              key={i}
              data-tooltip={row.rawValue.length > 24 ? row.rawValue : undefined}
              className="flex items-center px-3 gap-2 border-b border-border last:border-0"
              style={{ height: 24 }}
            >
              <span className="text-[0.62rem] font-mono text-accent/60 shrink-0 w-6 text-right">
                {i}
              </span>
              <span className={cn('text-[0.69rem] font-mono truncate', VALUE_CLASS[row.valueType])}>
                {row.value}
              </span>
            </div>
          ))
        : node.rows.map((row, i) => (
            <div
              key={i}
              data-tooltip={row.rawValue.length > 24 ? row.rawValue : undefined}
              className="flex items-center px-3 border-b border-border last:border-0"
              style={{ height: 24 }}
            >
              <span className="text-[0.69rem] text-on-surface-muted shrink-0 mr-2 font-mono max-w-[5.62rem] truncate">
                {row.key}
              </span>
              <span className={cn('text-[0.69rem] font-mono ml-auto truncate max-w-[6.25rem]', VALUE_CLASS[row.valueType])}>
                {row.value}
              </span>
            </div>
          ))}
    </div>
  )
}

function Graph({ layout }: { layout: GraphLayout }) {
  const edges: { from: string; to: string }[] = []
  for (const node of layout.nodes.values()) {
    for (const edge of node.childEdges) {
      edges.push({ from: node.id, to: edge.childId })
    }
  }

  return (
    <div
      className="relative"
      style={{ width: layout.totalWidth, height: layout.totalHeight }}
    >
      <svg
        className="absolute inset-0 pointer-events-none"
        width={layout.totalWidth}
        height={layout.totalHeight}
      >
        {edges.map(e => (
          <EdgePath key={`${e.from}-${e.to}`} from={e.from} to={e.to} nodes={layout.nodes} />
        ))}
      </svg>

      {[...layout.nodes.values()].map(node => (
        <NodeCard key={node.id} node={node} />
      ))}
    </div>
  )
}

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.0

export default function GraphMode({ input }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  const { layout, error } = useMemo(() => {
    if (!input.trim()) return { layout: null, error: null }
    try {
      const value = JSON.parse(input)
      return { layout: buildGraph(value), error: null }
    } catch (e) {
      return { layout: null, error: (e as Error).message }
    }
  }, [input])

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

  return (
    <div className="flex-1 relative flex flex-col min-h-0 min-w-0 bg-surface">
      {/* Viewport */}
      <div
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
            <p className="text-[0.75rem] text-red-500 font-mono bg-red-50 border border-red-200 rounded-[0.5rem] p-3">
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
            <Graph layout={layout} />
          </div>
        )}
      </div>

      {/* Zoom controls */}
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
}

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
