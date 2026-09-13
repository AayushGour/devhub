import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { leavesOf, type NavNode } from '../utils/navTree'

interface Props {
  tree: NavNode[]
  /** Id of the node whose page is open. */
  selectedId: string | null
  /** Chapter currently being spoken, so the tree can show where you are. */
  playingChapter: number | null
  /** Chapters that have no audio yet. */
  pendingChapters: Set<number>
  onSelect: (nodeId: string) => void
}

/**
 * The book's own table of contents.
 *
 * Selecting a leaf opens that chapter; selecting a branch opens everything
 * beneath it as one page. Expanding and selecting are deliberately separate —
 * the chevron only reveals children, so a section can be opened for reading
 * without collapsing what you were looking at.
 */
export default function ChapterTree({
  tree,
  selectedId,
  playingChapter,
  pendingChapters,
  onSelect,
}: Props) {
  return (
    <ul className="flex flex-col gap-px">
      {tree.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          playingChapter={playingChapter}
          pendingChapters={pendingChapters}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

interface RowProps extends Omit<Props, 'tree'> {
  node: NavNode
  depth: number
}

function TreeRow({ node, depth, selectedId, playingChapter, pendingChapters, onSelect }: RowProps) {
  // Walking and sorting the subtree is cheap once, but this runs for every row
  // on every playback tick — a few hundred rows several times a second.
  const leaves = useMemo(() => leavesOf(node), [node])
  const holdsPlaying = playingChapter !== null && leaves.includes(playingChapter)

  // A branch containing what is playing opens itself, so the reader can always
  // see where it is without hunting through collapsed sections.
  const [expanded, setExpanded] = useState(holdsPlaying)

  // Only on the way IN, though. Deriving `open` from `holdsPlaying` instead
  // would pin the branch open for as long as playback sat inside it, and the
  // chevron would silently do nothing.
  const [heldPlaying, setHeldPlaying] = useState(holdsPlaying)
  if (holdsPlaying !== heldPlaying) {
    setHeldPlaying(holdsPlaying)
    if (holdsPlaying) setExpanded(true)
  }

  const hasChildren = node.children.length > 0

  const selected = node.id === selectedId
  const pending = leaves.length > 0 && leaves.every((leaf) => pendingChapters.has(leaf))

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg cursor-pointer transition-colors duration-150',
          selected ? 'bg-surface-hover' : 'hover:bg-surface-hover',
        )}
        // Indentation is a depth-derived value, not a fixed set of classes.
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        <button
          type="button"
          tabIndex={hasChildren ? 0 : -1}
          aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          className={cn(
            'shrink-0 p-1 rounded text-on-surface-muted transition-colors duration-150',
            hasChildren ? 'hover:text-on-surface' : 'invisible',
          )}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          title={node.title}
          className={cn(
            'flex-1 min-w-0 text-left py-1.5 pr-2 text-xs truncate transition-colors duration-150',
            selected ? 'text-accent' : pending ? 'text-on-surface-muted/60' : 'text-on-surface',
          )}
        >
          {node.title}
        </button>

        {holdsPlaying && (
          <Volume2 size={11} className="shrink-0 mr-2 text-accent" aria-label="Playing" />
        )}
      </div>

      {hasChildren && expanded && (
        <ul className="flex flex-col gap-px">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              playingChapter={playingChapter}
              pendingChapters={pendingChapters}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
