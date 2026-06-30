export interface GNode {
  id: string
  parentId: string | null
  edgeLabel: string | null
  title: string
  nodeType: 'object' | 'array' | 'scalar'
  rows: Array<{ key: string; value: string; valueType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'; rawValue: string }>
  childEdges: Array<{ childId: string; label: string }>
  x: number
  y: number
  width: number
  height: number
}

export interface GraphLayout {
  nodes: Map<string, GNode>
  rootId: string
  totalWidth: number
  totalHeight: number
}

export const NODE_WIDTH = 220
export const NODE_HEADER_H = 34
export const NODE_ROW_H = 24
const NODE_ROW_PADDING = 8
export const SPACING_X = 80
const SPACING_Y = 20
export const CANVAS_PAD = 32

// Max export node width; content wraps within this so rows auto-adjust height
export const EXPORT_NODE_WIDTH = 300

let _seq = 0

function fmtValue(v: unknown): { str: string; valueType: GNode['rows'][0]['valueType']; rawValue: string } {
  if (v === null) return { str: 'null', valueType: 'null', rawValue: 'null' }
  if (typeof v === 'boolean') return { str: String(v), valueType: 'boolean', rawValue: String(v) }
  if (typeof v === 'number') return { str: String(v), valueType: 'number', rawValue: String(v) }
  if (typeof v === 'string') {
    const s = v.length > 24 ? v.slice(0, 24) + '…' : v
    return { str: `"${s}"`, valueType: 'string', rawValue: v }
  }
  return { str: '…', valueType: 'null', rawValue: '' }
}

function buildNode(
  value: unknown,
  edgeLabel: string | null,
  parentId: string | null,
  nodes: Map<string, GNode>
): string {
  const id = `n${++_seq}`
  const isArr = Array.isArray(value)
  const isObj = !isArr && value !== null && typeof value === 'object'

  const rows: GNode['rows'] = []
  const childEdges: GNode['childEdges'] = []

  if (isObj || isArr) {
    const entries: [string, unknown][] = isArr
      ? (value as unknown[]).map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>)

    for (const [k, v] of entries) {
      if (v !== null && typeof v === 'object') {
        const childId = buildNode(v, isArr ? `[${k}]` : k, id, nodes)
        childEdges.push({ childId, label: isArr ? `[${k}]` : k })
        const isChildArr = Array.isArray(v)
        const childCount = isChildArr ? (v as unknown[]).length : Object.keys(v as object).length
        const childLabel = isChildArr
          ? `[ ${childCount} item${childCount !== 1 ? 's' : ''} ]`
          : `{ ${childCount} key${childCount !== 1 ? 's' : ''} }`
        rows.push({ key: isArr ? `[${k}]` : k, value: childLabel, valueType: isChildArr ? 'array' : 'object', rawValue: '' })
      } else {
        const { str, valueType, rawValue } = fmtValue(v)
        rows.push({ key: isArr ? `[${k}]` : k, value: str, valueType, rawValue })
      }
    }
  } else {
    const { str, valueType, rawValue } = fmtValue(value)
    rows.push({ key: edgeLabel ?? 'value', value: str, valueType, rawValue })
  }

  const count = isArr
    ? (value as unknown[]).length
    : isObj
    ? Object.keys(value as object).length
    : 0

  const nodeType: GNode['nodeType'] = isArr ? 'array' : isObj ? 'object' : 'scalar'

  const title = isArr
    ? `${count} item${count !== 1 ? 's' : ''}`
    : isObj
    ? `${count} key${count !== 1 ? 's' : ''}`
    : 'value'

  const height = NODE_HEADER_H + rows.length * NODE_ROW_H + (rows.length ? NODE_ROW_PADDING : 0)

  nodes.set(id, {
    id, parentId, edgeLabel, title, nodeType, rows, childEdges,
    x: 0, y: 0, width: NODE_WIDTH, height,
  })

  return id
}

function subtreeH(id: string, nodes: Map<string, GNode>, cache: Map<string, number>): number {
  if (cache.has(id)) return cache.get(id)!
  const node = nodes.get(id)!
  if (node.childEdges.length === 0) {
    cache.set(id, node.height)
    return node.height
  }
  const childSum = node.childEdges.reduce((s, e) => s + subtreeH(e.childId, nodes, cache), 0)
  const withGap = childSum + (node.childEdges.length - 1) * SPACING_Y
  const h = Math.max(node.height, withGap)
  cache.set(id, h)
  return h
}

function assignPos(
  id: string,
  nodes: Map<string, GNode>,
  cache: Map<string, number>,
  level: number,
  yTop: number,
  yBot: number
) {
  const node = nodes.get(id)!
  node.x = CANVAS_PAD + level * (NODE_WIDTH + SPACING_X)
  node.y = (yTop + yBot) / 2 - node.height / 2

  if (!node.childEdges.length) return

  let cy = yTop
  for (const edge of node.childEdges) {
    const ch = subtreeH(edge.childId, nodes, cache)
    assignPos(edge.childId, nodes, cache, level + 1, cy, cy + ch)
    cy += ch + SPACING_Y
  }
}

export function buildGraph(value: unknown): GraphLayout {
  _seq = 0
  const nodes = new Map<string, GNode>()
  const rootId = buildNode(value, null, null, nodes)

  const cache = new Map<string, number>()
  const rootH = subtreeH(rootId, nodes, cache)
  assignPos(rootId, nodes, cache, 0, CANVAS_PAD, CANVAS_PAD + rootH)

  let maxX = 0
  let maxY = 0
  for (const n of nodes.values()) {
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }

  return {
    nodes,
    rootId,
    totalWidth: maxX + CANVAS_PAD,
    totalHeight: maxY + CANVAS_PAD,
  }
}
