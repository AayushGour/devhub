import { useCallback, useMemo, useState } from 'react'
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
import { cn } from '@/lib/utils'
import type { RepoGraph } from '../types'

interface Props {
  graph: RepoGraph
  onNodeClick: (path: string) => void
  selectedNode: string | null
}

function buildFlowNodes(graph: RepoGraph): Node[] {
  // Simple grid layout — React Flow will let user drag
  const internals = graph.nodes.filter((n) => n.type === 'internal')
  const externals = graph.nodes.filter((n) => n.type === 'external')
  const cols = Math.ceil(Math.sqrt(internals.length))

  return [
    ...internals.map((n, i): Node => ({
      id: n.id,
      position: { x: (i % cols) * 200, y: Math.floor(i / cols) * 120 },
      data: { label: n.label, color: n.color, type: 'internal' },
      type: 'default',
      style: {
        background: n.color + '22',
        borderColor: n.color,
        borderWidth: 1.5,
        borderRadius: '0.5rem',
        color: 'var(--on-surface)',
        fontSize: '0.7rem',
        padding: '4px 8px',
        minWidth: '80px',
        maxWidth: '160px',
      },
    })),
    ...externals.map((n, i): Node => ({
      id: n.id,
      position: { x: cols * 200 + 120, y: i * 60 },
      data: { label: n.label, type: 'external' },
      type: 'default',
      style: {
        background: 'var(--surface-raised)',
        borderColor: 'var(--border)',
        borderWidth: 1,
        borderRadius: '0.25rem',
        color: 'var(--on-surface-muted)',
        fontSize: '0.65rem',
        padding: '2px 6px',
      },
    })),
  ]
}

function buildFlowEdges(graph: RepoGraph): Edge[] {
  return graph.edges.map((e): Edge => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: 'var(--border)', strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border)', width: 12, height: 12 },
  }))
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

  const initialNodes = useMemo(() => buildFlowNodes(filteredGraph), [filteredGraph])
  const initialEdges = useMemo(() => buildFlowEdges(filteredGraph), [filteredGraph])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

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

  // selectedNode is available for future use (e.g. highlighting)
  void selectedNode

  return (
    <div className="relative flex-1 min-h-0 bg-surface">
      {/* Toolbar */}
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

      {/* Language legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 max-w-xs">
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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
        />
        <MiniMap
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
          maskColor="var(--surface)88"
        />
      </ReactFlow>
    </div>
  )
}
