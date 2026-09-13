import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BookRail from './BookRail'
import type { BookRecord, JobRecord } from '../types'

const store = vi.hoisted(() => ({
  books: [] as BookRecord[],
  jobs: {} as Record<string, JobRecord>,
  activeBookId: null as string | null,
  removeBook: vi.fn(async () => {}),
}))

vi.mock('../store/audiobookStore', () => ({
  useAudiobookStore: (select: (state: typeof store) => unknown) => select(store),
}))

const book = (id: string, title: string): BookRecord => ({
  id,
  title,
  author: 'Frank Herbert',
  language: 'en',
  sourceName: `${title}.epub`,
  sourceType: 'epub',
  mode: 'narrated',
  voiceId: 'af_heart',
  status: 'ready',
  chapterCount: 4,
  durationSec: 8040,
  createdAt: 0,
  updatedAt: 0,
})

beforeEach(() => {
  vi.clearAllMocks()
  store.books = [book('b1', 'Dune')]
  store.jobs = {}
  store.activeBookId = null
})

describe('BookRail', () => {
  it('opens a book when its row is activated', () => {
    const onSelect = vi.fn()
    render(<BookRail onAdd={vi.fn()} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /^Dune/ }))

    expect(onSelect).toHaveBeenCalledWith('b1')
  })

  // The delete control used to be nested inside a row that was itself
  // role="button": Enter on it removed the book and then opened it.
  it('does not open the book when the delete control is activated', () => {
    const onSelect = vi.fn()
    render(<BookRail onAdd={vi.fn()} onSelect={onSelect} />)
    const remove = screen.getByRole('button', { name: 'Remove Dune' })

    fireEvent.keyDown(remove, { key: 'Enter' })
    fireEvent.click(remove)

    expect(store.removeBook).toHaveBeenCalledWith('b1')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps the delete control out of the row control', () => {
    render(<BookRail onAdd={vi.fn()} onSelect={vi.fn()} />)

    const row = screen.getByRole('button', { name: /^Dune/ })
    const remove = screen.getByRole('button', { name: 'Remove Dune' })

    // Siblings, not nested — and the container that holds them is presentation
    // only, so there is no second Enter handler for a keypress to reach.
    expect(row).not.toContainElement(remove)
    expect(row.parentElement).toBe(remove.parentElement)
    expect(row.parentElement).not.toHaveAttribute('role')
    expect(row.parentElement).not.toHaveAttribute('tabindex')
  })

  it('shows the length of a finished book', () => {
    render(<BookRail onAdd={vi.fn()} onSelect={vi.fn()} />)

    expect(screen.getByText('4 chapters · 2h 14m')).toBeInTheDocument()
  })

  it('shows a placeholder when the library is empty', () => {
    store.books = []
    render(<BookRail onAdd={vi.fn()} onSelect={vi.fn()} />)

    expect(screen.getByText('No books yet.')).toBeInTheDocument()
  })
})
