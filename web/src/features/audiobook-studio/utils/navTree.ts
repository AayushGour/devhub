// The navigation tree, and the rules that turn it into pages and playback order.
//
// A leaf is a chapter — the same unit that owns one audio file. Branches only
// group leaves; they own nothing. That keeps narration, sealing and the
// exported package exactly as they are.
//
// Two invariants everything else depends on:
//
//   1. Leaf order IS document order. Playback walks leaves in that order and
//      never consults the tree to decide what comes next.
//   2. The views at any depth TILE the book. Every leaf belongs to exactly one
//      view, so advancing view by view cannot skip a leaf — including leaves
//      that sit shallower than the chosen depth, which form views of their own.

export interface NavNode {
  /** Stable within a book; also the React key and the tree's selection id. */
  id: string
  title: string
  /** Set when this node IS a chapter. Branch nodes leave it undefined. */
  chapterIndex?: number
  children: NavNode[]
}

/** A contiguous run of chapters shown as one scrollable page. */
export interface NavView {
  /** The node that produced this view. */
  id: string
  title: string
  /** Chapter indices, in document order. Never empty. */
  leaves: number[]
  /** How deep the producing node sits. Root children are depth 0. */
  depth: number
}

/** Every chapter index beneath a node, in document order. */
export function leavesOf(node: NavNode): number[] {
  const out: number[] = []
  const walk = (current: NavNode) => {
    if (current.chapterIndex !== undefined) out.push(current.chapterIndex)
    current.children.forEach(walk)
  }
  walk(node)
  return out.sort((a, b) => a - b)
}

/** Every chapter index in the tree, in document order. */
export function allLeaves(tree: NavNode[]): number[] {
  return tree.flatMap(leavesOf).sort((a, b) => a - b)
}

export function findNode(tree: NavNode[], id: string): NavNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return undefined
}

/** Depth of a node, counting root children as 0. */
export function depthOf(tree: NavNode[], id: string, depth = 0): number {
  for (const node of tree) {
    if (node.id === id) return depth
    const found = depthOf(node.children, id, depth + 1)
    if (found >= 0) return found
  }
  return -1
}

/**
 * The views at a given depth.
 *
 * A node shallower than `depth` that has no children deep enough still forms
 * its own view — front matter sitting beside nested sections is the usual case.
 * That is what makes the result a tiling rather than a filter.
 */
export function viewsAtDepth(tree: NavNode[], depth: number): NavView[] {
  const views: NavView[] = []

  const walk = (node: NavNode, current: number) => {
    const atTargetDepth = current === depth
    const cannotGoDeeper = node.children.length === 0

    if (atTargetDepth || cannotGoDeeper) {
      const leaves = leavesOf(node)
      if (leaves.length > 0) {
        // Every view reports the depth it was LISTED at, not where its node
        // sits. That is what makes viewsAtDepth(tree, view.depth) contain the
        // view again — without it, stepping from a shallow view looks it up in
        // a list it does not belong to, finds nothing, and restarts the book.
        views.push({ id: node.id, title: node.title, leaves, depth })
      }
      return
    }

    // A branch that also owns a chapter of its own — a section whose landing
    // page is itself narrated — contributes that chapter before its children,
    // or it would be dropped on the way down.
    if (node.chapterIndex !== undefined) {
      views.push({
        id: `${node.id}:self`,
        title: node.title,
        leaves: [node.chapterIndex],
        depth,
      })
    }

    node.children.forEach((child) => walk(child, current + 1))
  }

  tree.forEach((node) => walk(node, 0))

  return views.sort((a, b) => a.leaves[0] - b.leaves[0])
}

/** The view at `depth` that contains a given chapter. */
export function viewContaining(
  tree: NavNode[],
  depth: number,
  chapterIndex: number,
): NavView | undefined {
  return viewsAtDepth(tree, depth).find((view) => view.leaves.includes(chapterIndex))
}

/** The view that follows `view` at its own depth, or undefined at the end. */
export function nextView(tree: NavNode[], view: NavView): NavView | undefined {
  const views = viewsAtDepth(tree, view.depth)
  const at = views.findIndex((candidate) => candidate.id === view.id)
  return at >= 0 ? views[at + 1] : undefined
}

/**
 * The view a selection should open.
 *
 * Selecting a leaf gives a page of just that chapter; selecting a branch gives
 * every chapter beneath it, as one scrollable page.
 */
export function viewForNode(tree: NavNode[], id: string): NavView | undefined {
  const node = findNode(tree, id)
  if (!node) return undefined

  const leaves = leavesOf(node)
  if (leaves.length === 0) return undefined

  return { id: node.id, title: node.title, leaves, depth: depthOf(tree, id) }
}

/** A flat tree — one node per chapter — for sources with no hierarchy. */
export function flatTree(titles: string[]): NavNode[] {
  return titles.map((title, index) => ({
    id: `c${index}`,
    title,
    chapterIndex: index,
    children: [],
  }))
}

/**
 * Check that a tree accounts for every chapter exactly once.
 *
 * A tree built from a source's own table of contents can disagree with the
 * spine — entries pointing at the same document, or documents the contents
 * never mentions. Anything missing is appended so no chapter is unreachable.
 */
export function reconcile(tree: NavNode[], chapterCount: number, titleFor: (index: number) => string): NavNode[] {
  // Contents entries can point at documents that carry no readable text — a
  // cover page, usually. Those leave a node with nothing beneath it, which the
  // reader can select but which can never open anything.
  const pruned = pruneEmpty(tree)
  const seen = new Set(allLeaves(pruned))
  const missing: NavNode[] = []

  for (let index = 0; index < chapterCount; index++) {
    if (!seen.has(index)) {
      missing.push({ id: `c${index}`, title: titleFor(index), chapterIndex: index, children: [] })
    }
  }

  if (missing.length === 0) return pruned.length === tree.length ? tree : pruned

  // Put each orphan where it belongs in reading order rather than at the end.
  return [...pruned, ...missing].sort((a, b) => {
    const left = leavesOf(a)[0] ?? Number.POSITIVE_INFINITY
    const right = leavesOf(b)[0] ?? Number.POSITIVE_INFINITY
    return left - right
  })
}

/**
 * Build a tree from a flat list of chapters that each know their own depth.
 *
 * A chapter deeper than the one before it becomes its child. This is how a PDF
 * outline's nesting survives: the chapters are already in document order, and
 * the depths describe the shape they came from.
 */
export function treeFromDepths(
  chapters: { title: string; depth?: number }[],
): NavNode[] {
  const root: NavNode[] = []
  // Ancestors by depth, so a chapter can be attached under the right parent.
  const openAt: NavNode[] = []

  chapters.forEach((chapter, index) => {
    const depth = Math.max(0, chapter.depth ?? 0)
    const node: NavNode = {
      id: `c${index}`,
      title: chapter.title,
      chapterIndex: index,
      children: [],
    }

    // A depth with no open ancestor above it attaches as high as it can, so a
    // malformed outline cannot orphan a chapter.
    let parent: NavNode | undefined
    for (let level = depth - 1; level >= 0; level--) {
      if (openAt[level]) { parent = openAt[level]; break }
    }

    if (parent) parent.children.push(node)
    else root.push(node)

    openAt[depth] = node
    openAt.length = depth + 1
  })

  return root
}

/** Drop nodes that hold no chapter anywhere beneath them. */
export function pruneEmpty(tree: NavNode[]): NavNode[] {
  return tree
    .map((node) => ({ ...node, children: pruneEmpty(node.children) }))
    .filter((node) => node.chapterIndex !== undefined || node.children.length > 0)
}
