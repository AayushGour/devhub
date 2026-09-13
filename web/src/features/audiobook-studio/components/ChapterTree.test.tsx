import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ChapterTree from './ChapterTree'
import type { NavNode } from '../utils/navTree'

const leaf = (id: string, title: string, chapterIndex: number): NavNode => ({
  id, title, chapterIndex, children: [],
})
const branch = (id: string, title: string, children: NavNode[]): NavNode => ({
  id, title, children,
})

const TREE: NavNode[] = [
  branch('s1', 'Section 1', [leaf('c0', 'Chapter 1', 0), leaf('c1', 'Chapter 2', 1)]),
  branch('s2', 'Section 2', [leaf('c2', 'Chapter 3', 2)]),
]

const NOTHING_PENDING = new Set<number>()

function tree(playingChapter: number | null) {
  return (
    <ChapterTree
      tree={TREE}
      selectedId={null}
      playingChapter={playingChapter}
      pendingChapters={NOTHING_PENDING}
      onSelect={vi.fn()}
    />
  )
}

/** The chevron belonging to a branch, not to anything nested beneath it. */
function chevron(branchTitle: string, label: 'Expand' | 'Collapse') {
  const row = screen.getByRole('button', { name: branchTitle }).closest('li')
  return within(row as HTMLElement).getByRole('button', { name: label })
}

describe('ChapterTree', () => {
  it('shows nothing as playing when nothing is', () => {
    render(tree(null))

    expect(screen.queryByLabelText('Playing')).not.toBeInTheDocument()
    // Chapter 0 is not special — no branch opens itself just because the
    // chapter index happens to sit at its default.
    expect(screen.queryByRole('button', { name: 'Chapter 1' })).not.toBeInTheDocument()
  })

  it('opens the branch holding the playing chapter', () => {
    render(tree(0))

    expect(screen.getByRole('button', { name: 'Chapter 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chapter 3' })).not.toBeInTheDocument()
  })

  it('opens a branch when playback enters it', () => {
    const { rerender } = render(tree(null))
    expect(screen.queryByRole('button', { name: 'Chapter 3' })).not.toBeInTheDocument()

    rerender(tree(2))
    expect(screen.getByRole('button', { name: 'Chapter 3' })).toBeInTheDocument()
  })

  it('lets the reader collapse the branch that is playing', () => {
    render(tree(0))

    fireEvent.click(chevron('Section 1', 'Collapse'))

    expect(screen.queryByRole('button', { name: 'Chapter 1' })).not.toBeInTheDocument()
    // Still flagged as where playback is, just not forced open.
    expect(screen.getByLabelText('Playing')).toBeInTheDocument()
  })

  it('keeps a deliberately collapsed branch shut as playback moves inside it', () => {
    const { rerender } = render(tree(0))
    fireEvent.click(chevron('Section 1', 'Collapse'))

    rerender(tree(1))

    expect(screen.queryByRole('button', { name: 'Chapter 2' })).not.toBeInTheDocument()
  })

  it('reopens the branch if playback leaves and comes back', () => {
    const { rerender } = render(tree(0))
    fireEvent.click(chevron('Section 1', 'Collapse'))

    rerender(tree(2))
    rerender(tree(0))

    expect(screen.getByRole('button', { name: 'Chapter 1' })).toBeInTheDocument()
  })

  it('lets the reader expand a branch nothing is playing in', () => {
    render(tree(null))

    fireEvent.click(chevron('Section 2', 'Expand'))

    expect(screen.getByRole('button', { name: 'Chapter 3' })).toBeInTheDocument()
  })
})
