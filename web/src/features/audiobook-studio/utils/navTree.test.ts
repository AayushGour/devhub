import { describe, it, expect } from 'vitest'
import {
  allLeaves,
  treeFromDepths,
  flatTree,
  leavesOf,
  nextView,
  reconcile,
  viewContaining,
  viewForNode,
  viewsAtDepth,
  type NavNode,
} from './navTree'

const leaf = (id: string, title: string, chapterIndex: number): NavNode => ({
  id, title, chapterIndex, children: [],
})
const branch = (id: string, title: string, children: NavNode[]): NavNode => ({
  id, title, children,
})

/**
 * Front matter beside nested sections — the shape a real book actually has,
 * and the one that breaks naive depth filtering.
 */
const BOOK: NavNode[] = [
  leaf('fore', 'Foreword', 0),
  leaf('pref', 'Preface', 1),
  branch('s1', 'Section 1', [
    leaf('c1', 'Chapter 1', 2),
    leaf('c2', 'Chapter 2', 3),
  ]),
  branch('s2', 'Section 2', [
    leaf('c3', 'Chapter 3', 4),
    leaf('c4', 'Chapter 4', 5),
  ]),
  leaf('ack', 'Acknowledgments', 6),
]

describe('leaves', () => {
  it('reads a subtree in document order', () => {
    expect(leavesOf(BOOK[2])).toEqual([2, 3])
    expect(allLeaves(BOOK)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('views tile the book', () => {
  it('covers every chapter exactly once at the top level', () => {
    const views = viewsAtDepth(BOOK, 0)
    expect(views.map((v) => v.title)).toEqual([
      'Foreword', 'Preface', 'Section 1', 'Section 2', 'Acknowledgments',
    ])
    // The whole point: nothing is dropped and nothing is read twice.
    expect(views.flatMap((v) => v.leaves)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('covers every chapter exactly once one level down', () => {
    const views = viewsAtDepth(BOOK, 1)
    // Front matter is shallower than the requested depth, so it forms its own
    // view rather than vanishing.
    expect(views.map((v) => v.title)).toEqual([
      'Foreword', 'Preface', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4',
      'Acknowledgments',
    ])
    expect(views.flatMap((v) => v.leaves)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('covers every chapter at a depth deeper than the tree goes', () => {
    const views = viewsAtDepth(BOOK, 9)
    expect(views.flatMap((v) => v.leaves)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('keeps a section that is itself narrated', () => {
    // A section landing page that has its own text, plus children.
    const withSelf: NavNode[] = [
      { id: 's', title: 'Section', chapterIndex: 0, children: [leaf('a', 'A', 1)] },
    ]
    expect(viewsAtDepth(withSelf, 1).flatMap((v) => v.leaves)).toEqual([0, 1])
  })
})

describe('advancing', () => {
  it('moves to the next sibling view and then into the next parent', () => {
    const views = viewsAtDepth(BOOK, 1)
    const chapter2 = views.find((v) => v.title === 'Chapter 2')!

    // Chapter 2 is the last child of Section 1; the next leaf belongs to
    // Section 2. Advancing must cross that boundary, not stop at it.
    expect(nextView(BOOK, chapter2)?.title).toBe('Chapter 3')
  })

  it('walks the whole book without skipping, one view at a time', () => {
    for (const depth of [0, 1, 2]) {
      const visited: number[] = []
      let view = viewsAtDepth(BOOK, depth)[0]
      while (view) {
        visited.push(...view.leaves)
        view = nextView(BOOK, view)!
      }
      expect(visited, `depth ${depth}`).toEqual([0, 1, 2, 3, 4, 5, 6])
    }
  })

  it('can always find a view again in the list for its own depth', () => {
    // Stepping looks a view up by id in viewsAtDepth(tree, view.depth). If the
    // view is not in that list the lookup fails and navigation jumps to the
    // start of the book.
    for (const depth of [0, 1, 2, 5]) {
      for (const view of viewsAtDepth(BOOK, depth)) {
        const siblings = viewsAtDepth(BOOK, view.depth)
        expect(
          siblings.some((s) => s.id === view.id),
          `view "${view.title}" listed at depth ${depth} is missing from its own level`,
        ).toBe(true)
      }
    }
  })

  it('steps forward one page at a time without going backwards', () => {
    for (const depth of [0, 1, 2]) {
      const views = viewsAtDepth(BOOK, depth)
      for (let i = 0; i < views.length - 1; i++) {
        const following = nextView(BOOK, views[i])
        expect(following?.id, `after "${views[i].title}" at depth ${depth}`)
          .toBe(views[i + 1].id)
        // Reading order only ever moves forward.
        expect(following!.leaves[0]).toBeGreaterThan(views[i].leaves[0])
      }
    }
  })

  it('stops at the end', () => {
    const views = viewsAtDepth(BOOK, 0)
    expect(nextView(BOOK, views[views.length - 1])).toBeUndefined()
  })
})

describe('selection', () => {
  it('opens a single chapter for a leaf', () => {
    expect(viewForNode(BOOK, 'c1')).toMatchObject({ leaves: [2], depth: 1 })
  })

  it('opens every chapter beneath a branch as one page', () => {
    expect(viewForNode(BOOK, 's2')).toMatchObject({ leaves: [4, 5], depth: 0 })
  })

  it('finds the view holding a chapter', () => {
    expect(viewContaining(BOOK, 0, 3)?.title).toBe('Section 1')
    expect(viewContaining(BOOK, 1, 3)?.title).toBe('Chapter 2')
  })
})

describe('reconcile', () => {
  it('adds chapters the contents never mentioned, in reading order', () => {
    const partial: NavNode[] = [leaf('a', 'A', 1)]
    const fixed = reconcile(partial, 3, (i) => `Chapter ${i}`)
    expect(allLeaves(fixed)).toEqual([0, 1, 2])
    expect(fixed.map((n) => n.title)).toEqual(['Chapter 0', 'A', 'Chapter 2'])
  })

  it('drops a contents entry that owns no readable document', () => {
    // "Cover" is listed in the contents but its document carries no text, so
    // it never claims a chapter. Selecting it could only ever do nothing.
    const withDeadEntry: NavNode[] = [
      leaf('a', 'Foreword', 0),
      { id: 'cover', title: 'Cover', children: [] },
      leaf('b', 'Chapter 1', 1),
    ]
    const fixed = reconcile(withDeadEntry, 2, (i) => `Chapter ${i}`)
    expect(fixed.map((n) => n.title)).toEqual(['Foreword', 'Chapter 1'])
  })

  it('keeps a branch whose children do own chapters', () => {
    const nested: NavNode[] = [branch('s', 'Section', [leaf('c', 'Chapter', 0)])]
    expect(reconcile(nested, 1, () => 'x')).toHaveLength(1)
  })

  it('leaves a complete tree alone', () => {
    expect(reconcile(BOOK, 7, () => 'x')).toBe(BOOK)
  })
})

describe('flatTree', () => {
  it('gives one node per chapter when a source has no hierarchy', () => {
    const tree = flatTree(['One', 'Two'])
    expect(allLeaves(tree)).toEqual([0, 1])
    expect(viewsAtDepth(tree, 0).map((v) => v.title)).toEqual(['One', 'Two'])
  })
})

describe('treeFromDepths', () => {
  it('nests chapters under the entry above them', () => {
    const tree = treeFromDepths([
      { title: 'Developer Brief', depth: 0 },
      { title: '1. What we are building', depth: 1 },
      { title: '2. Current state', depth: 1 },
      { title: 'Appendix', depth: 0 },
    ])

    expect(tree.map((n) => n.title)).toEqual(['Developer Brief', 'Appendix'])
    expect(tree[0].children.map((n) => n.title)).toEqual([
      '1. What we are building',
      '2. Current state',
    ])
    // Every chapter is still reachable, in order.
    expect(allLeaves(tree)).toEqual([0, 1, 2, 3])
  })

  it('never orphans a chapter, even on a malformed outline', () => {
    // Starts at depth 2 with no parents above it.
    const tree = treeFromDepths([
      { title: 'Deep first', depth: 2 },
      { title: 'Top', depth: 0 },
      { title: 'Child', depth: 1 },
    ])
    expect(allLeaves(tree)).toEqual([0, 1, 2])
    expect(viewsAtDepth(tree, 0).flatMap((v) => v.leaves)).toEqual([0, 1, 2])
  })

  it('is flat when every chapter sits at the same depth', () => {
    const tree = treeFromDepths([{ title: 'A' }, { title: 'B' }])
    expect(tree).toHaveLength(2)
    expect(tree[0].children).toEqual([])
  })
})
