import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UploadDialog from './UploadDialog'
import { estimateQuota, requestPersistence } from '../utils/db'

// db.ts opens IndexedDB and conversionEngine.ts spins up workers — neither has
// anything to do with what this dialog decides.
vi.mock('../utils/db', () => ({
  estimateQuota: vi.fn(async () => ({
    usage: 0,
    quota: 4 * 1024 ** 3,
    available: 4 * 1024 ** 3,
    persisted: true,
  })),
  requestPersistence: vi.fn(async () => true),
}))
vi.mock('../utils/conversionEngine', () => ({ previewVoice: vi.fn() }))

const persist = vi.fn(async () => true)
const persisted = vi.fn(async () => false)
const estimate = vi.fn(async () => ({ usage: 0, quota: 4 * 1024 ** 3 }))

function renderDialog(onImport = vi.fn()) {
  render(
    <UploadDialog
      defaultVoiceId="af_heart"
      speed={1}
      onCancel={vi.fn()}
      onImport={onImport}
    />,
  )
  return { onImport }
}

// By the input rather than by the prompt text, which is replaced by the name of
// whatever book has already been chosen.
const dropZone = () =>
  document.querySelector('input[type="file"]')!.closest('label') as HTMLElement

const drop = (file: File) =>
  fireEvent.drop(dropZone(), { dataTransfer: { files: [file] } })

const importButton = () => screen.getByRole('button', { name: /Narrate this book/i })

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate, persist, persisted },
  })
})

describe('UploadDialog', () => {
  it('accepts a dropped book', async () => {
    renderDialog()

    drop(new File(['x'], 'Dune.epub'))

    expect(await screen.findByText('Dune.epub')).toBeInTheDocument()
    expect(importButton()).not.toBeDisabled()
  })

  it('accepts extensions regardless of case', async () => {
    renderDialog()

    drop(new File(['x'], 'NOTES.MD'))

    expect(await screen.findByText('NOTES.MD')).toBeInTheDocument()
  })

  // `accept` on the input only filters the picker; a drop lands unchecked, and
  // the import path would write a book row before discovering it cannot parse.
  it('refuses a dropped file the picker would not have offered', () => {
    const { onImport } = renderDialog()

    drop(new File(['x'], 'cover.jpg', { type: 'image/jpeg' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/cover\.jpg/)
    expect(screen.getByText(/Drop a book here/)).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('clears the refusal once a real book is dropped', async () => {
    renderDialog()

    drop(new File(['x'], 'cover.jpg'))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    drop(new File(['x'], 'Dune.epub'))
    await screen.findByText('Dune.epub')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the already-chosen book when a bad file is dropped on top', async () => {
    renderDialog()

    drop(new File(['x'], 'Dune.epub'))
    await screen.findByText('Dune.epub')

    drop(new File(['x'], 'cover.jpg'))

    expect(screen.getByText('Dune.epub')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  // Firefox raises a permission dialog for persist(); opening this screen is
  // not consent to that.
  it('does not ask for persistent storage before the reader commits', async () => {
    renderDialog()
    expect(requestPersistence).not.toHaveBeenCalled()

    drop(new File(['x'], 'Dune.epub'))
    await screen.findByText('Dune.epub')

    // Sizing the book up is fine; asking for a permission is not.
    await waitFor(() => expect(estimateQuota).toHaveBeenCalled())
    expect(requestPersistence).not.toHaveBeenCalled()
  })

  it('asks for persistent storage when the reader commits to narrating', async () => {
    const { onImport } = renderDialog()
    const book = new File(['x'], 'Dune.epub')

    drop(book)
    await screen.findByText('Dune.epub')

    fireEvent.click(importButton())

    expect(requestPersistence).toHaveBeenCalled()
    expect(onImport).toHaveBeenCalledWith(book, 'narrated', 'af_heart')
  })

  it('does not ask for persistent storage for a live book, which stores nothing', async () => {
    const { onImport } = renderDialog()
    const book = new File(['x'], 'Dune.epub')

    drop(book)
    await screen.findByText('Dune.epub')

    fireEvent.click(screen.getByRole('button', { name: /Read aloud live/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add and read aloud/i }))

    expect(requestPersistence).not.toHaveBeenCalled()
    expect(onImport).toHaveBeenCalledWith(book, 'live', 'af_heart')
  })
})
