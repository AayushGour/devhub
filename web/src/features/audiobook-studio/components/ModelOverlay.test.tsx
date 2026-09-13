// The overlay covers the whole studio, Stop included. Anything that can put it
// on screen must also be able to take it off again — a model load that fails
// used to leave it there permanently, and reloading only re-queued the
// conversion that put it there.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import ModelOverlay from './ModelOverlay'

let emitStatus: ((label: string, progress?: number) => void) | null = null
let emitError: ((message: string) => void) | null = null

vi.mock('../utils/conversionEngine', () => ({
  onModelStatus: (listener: (label: string, progress?: number) => void) => {
    emitStatus = listener
    return () => { emitStatus = null }
  },
  onModelError: (listener: (message: string) => void) => {
    emitError = listener
    return () => { emitError = null }
  },
}))

const overlay = () => screen.queryByText(/Preparing the narrator|could not be loaded/)

beforeEach(() => {
  emitStatus = null
  emitError = null
})

describe('ModelOverlay', () => {
  it('shows download progress and closes on ready', () => {
    render(<ModelOverlay />)
    expect(overlay()).toBeNull()

    act(() => emitStatus?.('downloading model…', 0.4))
    expect(screen.getByText('downloading model…')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()

    act(() => emitStatus?.('ready'))
    expect(overlay()).toBeNull()
  })

  it('can be dismissed when the load fails', () => {
    render(<ModelOverlay />)

    act(() => emitStatus?.('downloading model…', 0.4))
    act(() => emitError?.('Failed to fetch'))

    // The download it was showing is over, and the reason is on screen.
    expect(screen.queryByText('downloading model…')).toBeNull()
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    // Genuinely gone — not merely re-labelled.
    expect(overlay()).toBeNull()
  })

  it('drops a stale failure once a load is running again', () => {
    // The WASM fallback starts its own download after a WebGPU load failed.
    render(<ModelOverlay />)

    act(() => emitError?.('no webgpu device'))
    expect(screen.getByText('no webgpu device')).toBeInTheDocument()

    act(() => emitStatus?.('downloading model…', 0.1))
    expect(screen.queryByText('no webgpu device')).toBeNull()
    expect(screen.getByText('downloading model…')).toBeInTheDocument()
  })
})
