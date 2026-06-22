import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './GraphView.css'
import { cn } from '@/lib/utils'
import type { RepoGraph } from '../types'

interface Props {
  graph: RepoGraph
  onNodeClick: (path: string) => void
  selectedNode: string | null
}

const NODE_W = 160
const NODE_H = 32
const X_GAP = 80   // gap between layers (horizontal, left→right)
const Y_GAP = 14   // gap between nodes in same layer (vertical)

// ── Hierarchical tree layout ──────────────────────────────────────────────────
//
// 1. Assign layers via longest-path from sources (nodes with no incoming edges).
//    Entry-point files land at layer 0 (top); the files they import go deeper.
// 2. Barycenter heuristic: order nodes within each layer by the average
//    horizontal position of their predecessors → reduces edge crossings.
// 3. Isolated nodes (no edges) go in a compact grid below the tree.

function buildTreeLayout(
  nodes: RepoGraph['nodes'],
  edges: RepoGraph['edges'],
  selectedNode: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const internals = nodes.filter((n) => n.type === 'internal')
  const externals = nodes.filter((n) => n.type === 'external')
  const internalIds = new Set(internals.map((n) => n.id))

  // ── Build adjacency ─────────────────────────────────────────────────────────
  const outAdj = new Map<string, string[]>(internals.map((n) => [n.id, []]))
  const inAdj = new Map<string, string[]>(internals.map((n) => [n.id, []]))
  const inDeg = new Map<string, number>(internals.map((n) => [n.id, 0]))

  for (const e of edges) {
    if (!internalIds.has(e.source) || !internalIds.has(e.target)) continue
    outAdj.get(e.source)!.push(e.target)
    inAdj.get(e.target)!.push(e.source)
    inDeg.set(e.target, inDeg.get(e.target)! + 1)
  }

  // ── Separate connected vs isolated ─────────────────────────────────────────
  const hasEdge = new Set<string>()
  for (const e of edges) {
    hasEdge.add(e.source)
    hasEdge.add(e.target)
  }
  const connected = internals.filter((n) => hasEdge.has(n.id))
  const isolated = internals.filter((n) => !hasEdge.has(n.id))

  // ── Longest-path layer assignment (Kahn's BFS) ─────────────────────────────
  const layer = new Map<string, number>()
  const deg = new Map(inDeg)
  const queue: string[] = []

  for (const n of connected) {
    if (deg.get(n.id) === 0) {
      queue.push(n.id)
      layer.set(n.id, 0)
    }
  }

  let head = 0
  while (head < queue.length) {
    const id = queue[head++]
    const l = layer.get(id)!
    for (const nb of outAdj.get(id) ?? []) {
      const nl = l + 1
      if ((layer.get(nb) ?? -1) < nl) layer.set(nb, nl)
      deg.set(nb, deg.get(nb)! - 1)
      if (deg.get(nb) === 0) queue.push(nb)
    }
  }
  // Nodes in cycles that Kahn's didn't reach
  for (const n of connected) {
    if (!layer.has(n.id)) layer.set(n.id, 0)
  }

  // ── Group into layers ───────────────────────────────────────────────────────
  const layerBuckets = new Map<number, string[]>()
  for (const [id, l] of layer) {
    if (!layerBuckets.has(l)) layerBuckets.set(l, [])
    layerBuckets.get(l)!.push(id)
  }
  const sortedLayers = [...layerBuckets.entries()].sort((a, b) => a[0] - b[0])

  // ── Barycenter ordering within each layer ──────────────────────────────────
  const hPos = new Map<string, number>() // horizontal order position

  // Init first layer arbitrarily
  if (sortedLayers[0]) {
    sortedLayers[0][1].forEach((id, i) => hPos.set(id, i))
  }

  for (let i = 1; i < sortedLayers.length; i++) {
    const ids = sortedLayers[i][1]
    const ranked = ids.map((id) => {
      const preds = (inAdj.get(id) ?? []).filter((p) => hPos.has(p))
      const bc =
        preds.length === 0
          ? (hPos.get(id) ?? i * 5)
          : preds.reduce((s, p) => s + hPos.get(p)!, 0) / preds.length
      return { id, bc }
    })
    ranked.sort((a, b) => a.bc - b.bc)
    ranked.forEach(({ id }, j) => hPos.set(id, j))
    sortedLayers[i][1] = ranked.map((r) => r.id)
  }

  // ── Compute pixel positions (left → right tree) ────────────────────────────
  // Layer = X axis (roots left, leaves right)
  // Position within layer = Y axis
  const positions = new Map<string, { x: number; y: number }>()
  const X_STEP = NODE_W + X_GAP
  const Y_STEP = NODE_H + Y_GAP

  for (const [l, ids] of sortedLayers) {
    const colH = ids.length * Y_STEP - Y_GAP
    ids.forEach((id, i) => {
      positions.set(id, {
        x: l * X_STEP,
        y: i * Y_STEP - colH / 2,
      })
    })
  }

  // Isolated nodes: compact grid to the right of the tree
  const maxLayer = sortedLayers.length > 0 ? sortedLayers[sortedLayers.length - 1][0] : 0
  const isoStartX = (maxLayer + 2) * X_STEP
  const isoRows = Math.ceil(Math.sqrt(isolated.length / 2))
  const isoCols = Math.ceil(isolated.length / isoRows)
  const isoColH = isoRows * Y_STEP - Y_GAP
  isolated.forEach((n, i) => {
    positions.set(n.id, {
      x: isoStartX + Math.floor(i / isoRows) * X_STEP,
      y: (i % isoRows) * Y_STEP - isoColH / 2,
    })
  })

  // External packages: column further right
  const extStartX = isoStartX + (isoCols + 1) * X_STEP
  const extColH = externals.length * Y_STEP - Y_GAP
  externals.forEach((n, i) => {
    positions.set(n.id, {
      x: extStartX,
      y: i * Y_STEP - extColH / 2,
    })
  })

  // ── Build React Flow nodes ─────────────────────────────────────────────────
  const flowNodes: Node[] = nodes.map((n): Node => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    const isInternal = n.type === 'internal'
    const isSelected = n.id === selectedNode
    const isIsolated = isolated.some((iso) => iso.id === n.id)

    return {
      id: n.id,
      position: pos,
      data: { label: n.label },
      type: 'default',
      style: {
        background: isInternal ? `${n.color}18` : 'var(--surface-raised)',
        borderColor: isSelected
          ? 'var(--accent)'
          : isIsolated
            ? 'var(--border)'
            : isInternal
              ? n.color
              : 'var(--border)',
        borderWidth: isSelected ? 2 : 1.5,
        borderRadius: '0.375rem',
        color: isSelected
          ? 'var(--accent)'
          : isIsolated
            ? 'var(--on-surface-muted)'
            : 'var(--on-surface)',
        fontSize: '0.65rem',
        padding: '0 8px',
        width: NODE_W,
        height: NODE_H,
        display: 'flex',
        alignItems: 'center',
        opacity: isIsolated ? 0.55 : 1,
        boxShadow: isSelected ? '0 0 0 2px var(--accent)40' : 'none',
      },
    }
  })

  // ── Build React Flow edges ─────────────────────────────────────────────────
  const flowEdges: Edge[] = edges.map((e): Edge => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: { stroke: 'var(--accent)', strokeWidth: 1.5, opacity: 0.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'var(--accent)',
      width: 8,
      height: 8,
    },
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

export default function GraphView({ graph, onNodeClick, selectedNode }: Props) {
  const [showExternal, setShowExternal] = useState(false)

  const filteredGraph = useMemo(() => {
    if (showExternal) return graph
    return {
      nodes: graph.nodes.filter((n) => n.type === 'internal'),
      edges: graph.edges.filter((e) => !e.target.startsWith('pkg:')),
    }
  }, [graph, showExternal])

  const initial = useMemo(
    () => buildTreeLayout(filteredGraph.nodes, filteredGraph.edges, selectedNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredGraph],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  useEffect(() => {
    const { nodes: n, edges: e } = buildTreeLayout(
      filteredGraph.nodes,
      filteredGraph.edges,
      selectedNode,
    )
    setNodes(n)
    setEdges(e)
  }, [filteredGraph, selectedNode, setNodes, setEdges])

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const graphNode = graph.nodes.find((n) => n.id === node.id)
      if (graphNode?.path) onNodeClick(graphNode.path)
    },
    [graph.nodes, onNodeClick],
  )

  const languages = useMemo(() => {
    const langs = new Map<string, string>()
    graph.nodes
      .filter((n) => n.type === 'internal')
      .forEach((n) => langs.set(n.language, n.color))
    return langs
  }, [graph.nodes])

  return (
    <div className="relative flex-1 min-h-0 bg-surface">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setShowExternal((v) => !v)}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md border transition-colors duration-150',
            showExternal
              ? 'bg-accent text-accent-text border-accent'
              : 'bg-surface border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
          )}
        >
          {showExternal ? 'Hide' : 'Show'} external packages
        </button>
        <span className="text-xs text-on-surface-muted">
          {filteredGraph.nodes.length} nodes · {filteredGraph.edges.length} edges
        </span>
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-wrap justify-end gap-2 max-w-xs">
        {[...languages.entries()].slice(0, 8).map(([lang, color]) => (
          <span key={lang} className="flex items-center gap-1 text-[0.6rem] text-on-surface-muted">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            {lang}
          </span>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.04}
        maxZoom={2}
        nodesDraggable
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
        <Controls />
        <MiniMap
          maskColor="var(--surface)88"
          nodeColor={(n) => 'var(--accent)'}
        />
      </ReactFlow>
    </div>
  )
}
