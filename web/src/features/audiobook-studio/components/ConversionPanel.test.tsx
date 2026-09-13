// Exporting a book whose file is gone.
//
// A sealed book can lose its artifact without losing its row — the library
// warns that an origin without persistent storage may be evicted. The listing
// still offers Export, so the click has to end in something the reader can act
// on rather than in nothing at all.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConversionPanel from './ConversionPanel'
import type { BookRecord } from '../types'

const loadArtifactBlob = vi.fn<(id: string) => Promise<Blob | null>>()

vi.mock('../utils/bookSource', () => ({
  loadArtifactBlob: (id: string) => loadArtifactBlob(id),
}))

vi.mock('../utils/conversionEngine', () => ({
  cancelNarration: vi.fn(),
  reprocess: vi.fn(async () => ({ ok: true })),
  startNarration: vi.fn(async () => {}),
  upgradeToNarrated: vi.fn(async () => {}),
}))

const BOOK = {
  id: 'b1',
  title: 'Salt & Stone',
  author: 'A. Writer',
  language: 'en',
  sourceName: 'salt.epub',
  sourceType: 'epub',
  mode: 'narrated',
  voiceId: 'af_heart',
  status: 'ready',
  chapterCount: 3,
  durationSec: 300,
  createdAt: 1,
  updatedAt: 1,
} as BookRecord

beforeEach(() => {
  loadArtifactBlob.mockReset()
  // jsdom has no object URLs, and the happy path makes one.
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
    createObjectURL: vi.fn(() => 'blob:stub'),
    revokeObjectURL: vi.fn(),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function panel() {
  return render(<ConversionPanel book={BOOK} job={undefined} speed={1} voiceId="af_heart" />)
}

describe('Export', () => {
  it('says so when the browser has evicted the book', async () => {
    loadArtifactBlob.mockResolvedValue(null)
    panel()

    fireEvent.click(screen.getByRole('button', { name: /export/i }))

    // The failure has to be visible and has to name the way out of it. Before
    // this, the click returned silently and the reader was left clicking a
    // button that did nothing.
    const notice = await screen.findByText(/no longer stored/i)
    expect(notice).toBeInTheDocument()
    expect(notice.textContent).toMatch(/re-extract/i)
  })

  it('reports a failure from storage rather than swallowing it', async () => {
    loadArtifactBlob.mockRejectedValue(new Error('UnknownError: database is closed'))
    panel()

    fireEvent.click(screen.getByRole('button', { name: /export/i }))

    expect(await screen.findByText(/database is closed/i)).toBeInTheDocument()
  })

  it('downloads without complaint when the book is still there', async () => {
    loadArtifactBlob.mockResolvedValue(new Blob(['zip'], { type: 'application/epub+zip' }))

    // jsdom would try to navigate to the object URL and log a failure for it.
    const saved: HTMLAnchorElement[] = []
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this)
      })

    panel()
    fireEvent.click(screen.getByRole('button', { name: /export/i }))

    await waitFor(() => expect(saved).toHaveLength(1))
    // Punctuation is stripped and the gap it leaves is collapsed, or "Salt &
    // Stone" saves as "Salt  Stone.epub".
    expect(saved[0].download).toBe('Salt Stone.epub')
    expect(screen.queryByText(/no longer stored/i)).toBeNull()

    click.mockRestore()
  })
})
