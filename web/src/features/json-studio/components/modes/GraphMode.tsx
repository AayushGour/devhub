import { useMemo, useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle, useDeferredValue, memo } from 'react'
import { createPortal } from 'react-dom'
import { ZoomIn, ZoomOut, Maximize2, FileImage, Printer, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { buildGraph, recomputeExportLayout, EXPORT_NODE_WIDTH, NODE_WIDTH, SPACING_X, CANVAS_PAD, NODE_HEADER_H, NODE_ROW_H } from '../../utils/graphLayout'
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

  return createPortal(
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
    </div>,
    document.body
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
        <span
          data-tooltip={node.title}
          className="text-[0.69rem] font-semibold text-on-surface tracking-[-0.01rem] flex-1 truncate"
        >
          {node.title}
        </span>
        {node.edgeLabel && (
          <span
            data-tooltip={node.edgeLabel}
            className={cn(
              'text-[0.62rem] font-mono font-medium rounded-full px-[0.44rem] py-[0.06rem] shrink-0 truncate max-w-20 border',
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
              data-row-key={row.key}
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
              data-row-key={row.key}
              className="flex items-center px-3 border-b border-border last:border-0"
              style={{ height: 24 }}
            >
              <span
                data-tooltip={row.key}
                className="text-[0.69rem] text-on-surface-muted shrink-0 mr-2 font-mono max-w-[5.62rem] truncate"
              >
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

// memo: only re-renders when layout changes, never during zoom/pan
const Graph = memo(forwardRef<HTMLDivElement, { layout: GraphLayout }>(({ layout }, ref) => {
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
}))
Graph.displayName = 'Graph'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const VAL_CLASS: Record<GNode['rows'][0]['valueType'], string> = {
  string: 'str', number: 'num', boolean: 'bool', null: 'null', object: 'nested', array: 'nested',
}

function buildHtmlExport(layout: GraphLayout): string {
  const rs = getComputedStyle(document.documentElement)
  const v = (k: string) => rs.getPropertyValue(k).trim()
  const colors = {
    surface: v('--surface'), surfaceRaised: v('--surface-raised'), border: v('--border'),
    accent: v('--accent'), onSurface: v('--on-surface'), onSurfaceMuted: v('--on-surface-muted'),
    jsonString: v('--json-string'), jsonNumber: v('--json-number'),
    jsonBool: v('--json-bool'), jsonNull: v('--json-null'),
  }

  // Measure text to compute per-row heights for export (rows show full text, no truncation)
  const mCtx = document.createElement('canvas').getContext('2d')!
  mCtx.font = `11px ui-monospace,Menlo,Monaco,"Cascadia Mono","Segoe UI Mono",monospace`
  const PADDING_H = 24   // 12px left + 12px right
  const GAP = 8
  const IDX_W = 28       // index column width in array rows
  const KEY_MAX_W = 90   // max-width of key column in object rows
  const LINE_H = 18      // line height at 11px mono
  const ROW_VERT_PAD = 8 // top+bottom text padding per row
  const ROW_MIN_H = 24

  // Per-node: array of per-row heights (used for edge origin Y and inline row style)
  const exportRowHeights = new Map<string, number[]>()
  const exportHeights = new Map<string, number>()

  for (const [id, node] of layout.nodes) {
    const isArr = node.nodeType === 'array'
    const rowHs: number[] = []
    let totalH = NODE_HEADER_H
    for (const row of node.rows) {
      const isNested = row.valueType === 'object' || row.valueType === 'array'
      const displayVal = isNested
        ? row.value
        : row.valueType === 'string' ? `"${row.rawValue}"` : (row.rawValue || row.value)

      let rowH: number
      if (isArr) {
        const valAvail = EXPORT_NODE_WIDTH - PADDING_H - IDX_W - GAP
        const valPx = mCtx.measureText(displayVal).width
        const lines = Math.max(1, Math.ceil(valPx / valAvail))
        rowH = Math.max(ROW_MIN_H, lines * LINE_H + ROW_VERT_PAD)
      } else {
        const keyPx = mCtx.measureText(row.key).width
        const keyLines = Math.max(1, Math.ceil(keyPx / KEY_MAX_W))
        const valAvail = EXPORT_NODE_WIDTH - PADDING_H - Math.min(keyPx, KEY_MAX_W) - GAP
        const valPx = mCtx.measureText(displayVal).width
        const valLines = Math.max(1, Math.ceil(valPx / valAvail))
        rowH = Math.max(ROW_MIN_H, Math.max(keyLines, valLines) * LINE_H + ROW_VERT_PAD)
      }
      // Safety buffer: font metrics vary across systems
      rowH += 4
      rowHs.push(rowH)
      totalH += rowH
    }
    exportRowHeights.set(id, rowHs)
    exportHeights.set(id, totalH)
  }

  // Recompute Y positions with export heights so no cards overlap
  const exportLayout = recomputeExportLayout(layout, exportHeights)

  // Remap X positions to EXPORT_NODE_WIDTH
  const nodeX = new Map<string, number>()
  for (const [id, node] of exportLayout.nodes) {
    const level = Math.round((node.x - CANVAS_PAD) / (NODE_WIDTH + SPACING_X))
    nodeX.set(id, CANVAS_PAD + level * (EXPORT_NODE_WIDTH + SPACING_X))
  }
  let maxRight = 0
  for (const [id] of exportLayout.nodes) maxRight = Math.max(maxRight, (nodeX.get(id) ?? 0) + EXPORT_NODE_WIDTH)
  const totalWidth = maxRight + CANVAS_PAD
  const totalHeight = exportLayout.totalHeight

  // Edge paths — use cumulative per-row heights for row-origin Y
  const edgePaths: string[] = []
  for (const node of exportLayout.nodes.values()) {
    const rowHs = exportRowHeights.get(node.id) ?? []
    for (const edge of node.childEdges) {
      const dst = exportLayout.nodes.get(edge.childId)!
      const x1 = (nodeX.get(node.id) ?? 0) + EXPORT_NODE_WIDTH
      const rowIndex = node.rows.findIndex(r => r.key === edge.label)
      let y1: number
      if (rowIndex >= 0) {
        const cumY = rowHs.slice(0, rowIndex).reduce((a, h) => a + h, 0)
        y1 = node.y + NODE_HEADER_H + cumY + rowHs[rowIndex] / 2
      } else {
        y1 = node.y + (exportHeights.get(node.id) ?? node.height) / 2
      }
      const x2 = nodeX.get(dst.id) ?? 0
      const y2 = dst.y + (exportHeights.get(dst.id) ?? dst.height) / 2
      const mid = (x1 + x2) / 2
      edgePaths.push(`<path d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" fill="none" stroke="${esc(colors.border)}" stroke-width="1.5"/>`)
    }
  }

  // Node cards HTML
  const nodesHtml: string[] = []
  for (const node of exportLayout.nodes.values()) {
    const x = nodeX.get(node.id) ?? 0
    const isArr = node.nodeType === 'array'
    const rowHs = exportRowHeights.get(node.id) ?? []

    const rowsHtml = node.rows.map((row, i) => {
      const isNested = row.valueType === 'object' || row.valueType === 'array'
      const displayVal = isNested ? row.value : row.valueType === 'string' ? `"${row.rawValue}"` : (row.rawValue || row.value)
      const cls = VAL_CLASS[row.valueType]
      const rowStyle = rowHs[i] ? ` style="min-height:${rowHs[i]}px"` : ''
      if (isArr) {
        const idx = row.key.replace(/^\[(\d+)\]$/, '$1')
        return `<div class="row"${rowStyle}><span class="row-idx">${esc(idx)}</span><span class="row-val ${cls}">${esc(displayVal)}</span></div>`
      }
      return `<div class="row"${rowStyle}><span class="row-key">${esc(row.key)}</span><span class="row-val ${cls}">${esc(displayVal)}</span></div>`
    }).join('')

    const edgeLabelHtml = node.edgeLabel
      ? `<span class="edge-label">${esc(node.edgeLabel)}</span>`
      : ''

    nodesHtml.push(
      `<div class="node${isArr ? ' arr' : ''}" style="left:${x}px;top:${node.y}px;width:${EXPORT_NODE_WIDTH}px;">` +
      `<div class="header${isArr ? ' arr' : ''}">` +
      `<span class="type-mark${isArr ? ' arr' : ''}">${isArr ? '[ ]' : '{ }'}</span>` +
      `<span class="node-title">${esc(node.title)}</span>${edgeLabelHtml}</div>` +
      `${rowsHtml}</div>`
    )
  }

  const css = `
:root{--surface:${colors.surface};--surface-raised:${colors.surfaceRaised};--border:${colors.border};--accent:${colors.accent};--on-surface:${colors.onSurface};--on-surface-muted:${colors.onSurfaceMuted};--json-string:${colors.jsonString};--json-number:${colors.jsonNumber};--json-bool:${colors.jsonBool};--json-null:${colors.jsonNull};}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--surface);padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.canvas{position:relative;}
.node{position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.node.arr{border-color:color-mix(in srgb,var(--accent) 40%,transparent);}
.header{height:34px;padding:0 12px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);background:var(--surface-raised);flex-shrink:0;}
.header.arr{background:color-mix(in srgb,var(--accent) 8%,transparent);border-bottom-color:color-mix(in srgb,var(--accent) 25%,transparent);}
.type-mark{font-size:10px;font-weight:700;font-family:monospace;flex-shrink:0;color:var(--on-surface-muted);}
.type-mark.arr{color:var(--accent);}
.node-title{font-size:11px;font-weight:600;color:var(--on-surface);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.edge-label{font-size:10px;font-family:monospace;font-weight:500;border-radius:999px;padding:1px 7px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;background:var(--surface);border:1px solid var(--border);color:var(--accent);}
.row{display:flex;align-items:flex-start;padding:0 12px;border-bottom:1px solid var(--border);min-height:24px;gap:8px;}
.row:last-child{border-bottom:none;}
.row-idx{font-size:10px;font-family:monospace;color:var(--accent);opacity:.6;flex-shrink:0;min-width:24px;text-align:right;padding:4px 0;}
.row-key{font-size:11px;color:var(--on-surface-muted);font-family:monospace;flex-shrink:0;max-width:90px;word-break:break-word;padding:4px 0;}
.row-val{font-size:11px;font-family:monospace;word-break:break-word;padding:4px 0;margin-left:auto;text-align:right;}
.row-val.str{color:var(--json-string);}.row-val.num{color:var(--json-number);}.row-val.bool{color:var(--json-bool);}.row-val.null{color:var(--json-null);}.row-val.nested{color:var(--on-surface-muted);font-style:italic;}`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Graph</title><style>${css}</style></head>` +
    `<body><div class="canvas" style="width:${totalWidth}px;height:${totalHeight}px;">` +
    `<svg style="position:absolute;inset:0;pointer-events:none;" width="${totalWidth}" height="${totalHeight}">` +
    `${edgePaths.join('')}</svg>${nodesHtml.join('')}</div></body></html>`
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || !text) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0, hi = text.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? text.slice(0, lo) + '…' : ''
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length >= 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
  return color
}

function buildCanvasExport(layout: GraphLayout): string {
  const rs = getComputedStyle(document.documentElement)
  const v = (k: string) => rs.getPropertyValue(k).trim()
  const c = {
    surface: v('--surface'), surfaceRaised: v('--surface-raised'), border: v('--border'),
    accent: v('--accent'), onSurface: v('--on-surface'), onSurfaceMuted: v('--on-surface-muted'),
    jsonString: v('--json-string'), jsonNumber: v('--json-number'),
    jsonBool: v('--json-bool'), jsonNull: v('--json-null'),
  }

  const nodeX = new Map<string, number>()
  for (const [id, node] of layout.nodes) {
    const level = Math.round((node.x - CANVAS_PAD) / (NODE_WIDTH + SPACING_X))
    nodeX.set(id, CANVAS_PAD + level * (EXPORT_NODE_WIDTH + SPACING_X))
  }
  let maxX = 0
  for (const [id] of layout.nodes) maxX = Math.max(maxX, (nodeX.get(id) ?? 0) + EXPORT_NODE_WIDTH)
  const totalW = maxX + CANVAS_PAD
  const totalH = layout.totalHeight + CANVAS_PAD

  const MAX = 8192
  const ratio = Math.min(2, MAX / totalW, MAX / totalH)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(totalW * ratio)
  canvas.height = Math.ceil(totalH * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.scale(ratio, ratio)

  // Background
  ctx.fillStyle = c.surface
  ctx.fillRect(0, 0, totalW, totalH)

  // Edges (drawn first, under nodes)
  ctx.strokeStyle = c.border
  ctx.lineWidth = 1.5
  for (const node of layout.nodes.values()) {
    for (const edge of node.childEdges) {
      const dst = layout.nodes.get(edge.childId)!
      const x1 = (nodeX.get(node.id) ?? 0) + EXPORT_NODE_WIDTH
      const ri = node.rows.findIndex(r => r.key === edge.label)
      const y1 = ri >= 0 ? node.y + NODE_HEADER_H + ri * NODE_ROW_H + NODE_ROW_H / 2 : node.y + node.height / 2
      const x2 = nodeX.get(dst.id) ?? 0
      const y2 = dst.y + dst.height / 2
      const mid = (x1 + x2) / 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2)
      ctx.stroke()
    }
  }

  const valColors: Record<string, string> = {
    string: c.jsonString, number: c.jsonNumber, boolean: c.jsonBool, null: c.jsonNull,
    object: c.onSurfaceMuted, array: c.accent,
  }
  const MONO = 'ui-monospace,Menlo,Monaco,"Cascadia Mono","Segoe UI Mono",monospace'
  const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'

  for (const node of layout.nodes.values()) {
    const nx = nodeX.get(node.id) ?? 0
    const ny = node.y
    const w = EXPORT_NODE_WIDTH
    const h = node.height
    const isArr = node.nodeType === 'array'
    const R = 10

    // Card fill + clip
    roundedRect(ctx, nx, ny, w, h, R)
    ctx.fillStyle = c.surface
    ctx.fill()

    ctx.save()
    roundedRect(ctx, nx, ny, w, h, R)
    ctx.clip()

    // Header background
    ctx.fillStyle = isArr ? withAlpha(c.accent, 0.08) : c.surfaceRaised
    ctx.fillRect(nx, ny, w, NODE_HEADER_H)

    // Header bottom border
    ctx.strokeStyle = isArr ? withAlpha(c.accent, 0.25) : c.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(nx, ny + NODE_HEADER_H)
    ctx.lineTo(nx + w, ny + NODE_HEADER_H)
    ctx.stroke()

    // Type marker
    ctx.font = `bold 10px ${MONO}`
    ctx.fillStyle = isArr ? c.accent : c.onSurfaceMuted
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(isArr ? '[ ]' : '{ }', nx + 12, ny + NODE_HEADER_H / 2)

    // Title
    ctx.font = `600 11px ${SANS}`
    ctx.fillStyle = c.onSurface
    const titleX = nx + 36
    const chipReserve = node.edgeLabel ? 76 : 0
    ctx.fillText(truncateText(ctx, node.title, w - 48 - chipReserve), titleX, ny + NODE_HEADER_H / 2)

    // Edge label chip
    if (node.edgeLabel) {
      ctx.font = `500 10px ${MONO}`
      const chipTxt = truncateText(ctx, node.edgeLabel, 66)
      const chipTxtW = ctx.measureText(chipTxt).width
      const chipW = chipTxtW + 14
      const chipX = nx + w - chipW - 12
      const chipY = ny + (NODE_HEADER_H - 18) / 2
      roundedRect(ctx, chipX, chipY, chipW, 18, 9)
      ctx.fillStyle = c.surface
      ctx.fill()
      ctx.strokeStyle = c.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = c.accent
      ctx.textBaseline = 'middle'
      ctx.fillText(chipTxt, chipX + 7, chipY + 9)
    }

    // Rows
    let rowY = ny + NODE_HEADER_H
    for (const row of node.rows) {
      const isNested = row.valueType === 'object' || row.valueType === 'array'
      const displayVal = isNested
        ? row.value
        : row.valueType === 'string' ? `"${row.rawValue}"` : (row.rawValue || row.value)
      const valColor = valColors[row.valueType] || c.onSurface

      // Row divider
      ctx.strokeStyle = c.border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(nx, rowY)
      ctx.lineTo(nx + w, rowY)
      ctx.stroke()

      const midY = rowY + NODE_ROW_H / 2
      ctx.textBaseline = 'middle'

      if (isArr) {
        const idx = row.key.replace(/^\[(\d+)\]$/, '$1')
        ctx.font = `10px ${MONO}`
        ctx.fillStyle = withAlpha(c.accent, 0.6)
        ctx.textAlign = 'right'
        ctx.fillText(idx, nx + 32, midY)

        ctx.font = `${isNested ? 'italic ' : ''}11px ${MONO}`
        ctx.fillStyle = valColor
        ctx.textAlign = 'left'
        ctx.fillText(truncateText(ctx, displayVal, w - 50), nx + 38, midY)
      } else {
        ctx.font = `11px ${MONO}`
        ctx.fillStyle = c.onSurfaceMuted
        ctx.textAlign = 'left'
        const keyTxt = truncateText(ctx, row.key, 90)
        ctx.fillText(keyTxt, nx + 12, midY)
        const keyUsed = ctx.measureText(keyTxt).width

        ctx.font = `${isNested ? 'italic ' : ''}11px ${MONO}`
        ctx.fillStyle = valColor
        ctx.textAlign = 'right'
        ctx.fillText(truncateText(ctx, displayVal, w - 28 - keyUsed), nx + w - 12, midY)
      }

      rowY += NODE_ROW_H
    }

    ctx.restore()

    // Card border (drawn last, on top of clipped content)
    roundedRect(ctx, nx, ny, w, h, R)
    ctx.strokeStyle = isArr ? withAlpha(c.accent, 0.4) : c.border
    ctx.lineWidth = 1
    ctx.stroke()
  }

  return canvas.toDataURL('image/png')
}

const ZOOM_STEP = 1.25
const ZOOM_MIN = 0.01
const ZOOM_MAX = 4.0

const GraphMode = forwardRef<GraphModeHandle, Props>(function GraphMode({ input, onExportPdf, onExportHtml }, ref) {
  // zoom state is only for the toolbar % display — not used for the actual transform
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const fitZoomRef = useRef(1)
  const fitPanRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)

  // Fix 2: defer heavy JSON.parse + buildGraph so typing stays responsive
  const deferredInput = useDeferredValue(input)

  const { layout, error } = useMemo(() => {
    if (!deferredInput.trim()) return { layout: null, error: null }
    try {
      const value = JSON.parse(deferredInput)
      return { layout: buildGraph(value), error: null }
    } catch (e) {
      return { layout: null, error: (e as Error).message }
    }
  }, [deferredInput])

  // Fix 1: direct DOM mutation — bypasses React render pipeline entirely
  const applyTransform = useCallback(() => {
    if (!canvasRef.current) return
    const { x, y } = panRef.current
    canvasRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoomRef.current})`
  }, [])

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
    zoomRef.current = fit
    panRef.current = { x: px, y: py }
    applyTransform()
    setZoom(fit)
  }, [layout, applyTransform])

  const zoomIn = useCallback(() => {
    zoomRef.current = Math.min(ZOOM_MAX, zoomRef.current * ZOOM_STEP)
    applyTransform()
    setZoom(zoomRef.current)
  }, [applyTransform])

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(ZOOM_MIN, zoomRef.current / ZOOM_STEP)
    applyTransform()
    setZoom(zoomRef.current)
  }, [applyTransform])

  const zoomReset = useCallback(() => {
    zoomRef.current = fitZoomRef.current
    panRef.current = { ...fitPanRef.current }
    applyTransform()
    setZoom(zoomRef.current)
  }, [applyTransform])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // PNG export — draws directly to canvas from layout data; no DOM clone, no getComputedStyle per element
  const exportPng = useCallback(async () => {
    if (!layout || isExporting) return
    setIsExporting(true)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    try {
      const dataUrl = buildCanvasExport(layout)
      const blob = await fetch(dataUrl).then(r => r.blob())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'graph.png'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }, [isExporting, layout])

  // PDF export — same canvas render, embedded as PNG in a print-ready HTML page
  const exportPdf = useCallback(async () => {
    if (!layout || isExporting) return
    setIsExporting(true)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    try {
      const dataUrl = buildCanvasExport(layout)
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
      setIsExporting(false)
    }
  }, [isExporting, onExportPdf, layout])

  // HTML export — generates HTML directly from layout data; no DOM cloning, no per-element style computation
  const exportHtml = useCallback(async () => {
    if (!layout || isExporting) return
    setIsExporting(true)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    try {
      const html = buildHtmlExport(layout)
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

  // Wheel/trackpad — direct style mutation, no React state during scroll
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
        zoomRef.current = newZoom
        panRef.current = {
          x: cx - (cx - curPan.x) * ratio,
          y: cy - (cy - curPan.y) * ratio,
        }
      } else {
        const curPan = panRef.current
        panRef.current = { x: curPan.x - e.deltaX, y: curPan.y - e.deltaY }
      }
      applyTransform()
      // Throttle toolbar % update to one React render per frame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          setZoom(zoomRef.current)
        })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  // Read pan from ref so onMouseDown has no dependency on pan state
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setTooltip(null)
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    setIsDragging(true)
  }, [])

  // Drag — direct style mutation, no React state during move
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      panRef.current = {
        x: dragStart.current.panX + (e.clientX - dragStart.current.mouseX),
        y: dragStart.current.panY + (e.clientY - dragStart.current.mouseY),
      }
      applyTransform()
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, applyTransform])

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
            ref={canvasRef}
            style={{
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
    <Tooltip content={title}>
      <button
        onClick={onClick}
        aria-label={title}
        disabled={disabled}
        className={cn(
          'flex items-center justify-center w-[1.88rem] py-[0.38rem] bg-transparent border-none cursor-pointer text-on-surface-muted transition-colors duration-150',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-hover hover:text-on-surface',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}
