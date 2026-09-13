import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VoicePicker from './VoicePicker'
import { previewVoice } from '../utils/conversionEngine'

// The real engine loads a TTS model into a worker.
vi.mock('../utils/conversionEngine', () => ({ previewVoice: vi.fn() }))

const contexts: FakeAudioContext[] = []

/** Enough of the Web Audio surface for playPcm; jsdom has none of it. */
class FakeAudioContext {
  state: 'running' | 'closed' = 'running'
  destination = {}
  close = vi.fn(async () => { this.state = 'closed' })

  constructor() {
    contexts.push(this)
  }

  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }

  createBufferSource() {
    return { buffer: null, onended: null, connect: () => {}, start: () => {} }
  }
}

const SAMPLE = { pcm: new Float32Array(8), sampleRate: 24000 }

const previewButton = () => screen.getByRole('button', { name: /Preview voice|Synthesising/ })

function renderPicker() {
  return render(<VoicePicker value="af_heart" speed={1} onChange={vi.fn()} />)
}

/** Let a resolved preview promise settle through its `.then` chain. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  contexts.length = 0
  vi.clearAllMocks()
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VoicePicker', () => {
  it('plays a sample through one context', async () => {
    vi.mocked(previewVoice).mockResolvedValue(SAMPLE)
    renderPicker()

    fireEvent.click(previewButton())

    await waitFor(() => expect(contexts).toHaveLength(1))
    expect(contexts[0].close).not.toHaveBeenCalled()
  })

  // A preview outlives the click that started it, so the second one has to cut
  // the first off or two voices read the sample at once.
  it('cuts off the previous sample when previewed again', async () => {
    vi.mocked(previewVoice).mockResolvedValue(SAMPLE)
    renderPicker()

    fireEvent.click(previewButton())
    await waitFor(() => expect(contexts).toHaveLength(1))
    await waitFor(() => expect(previewButton()).not.toBeDisabled())

    fireEvent.click(previewButton())
    await waitFor(() => expect(contexts).toHaveLength(2))

    expect(contexts[0].close).toHaveBeenCalled()
    expect(contexts[1].close).not.toHaveBeenCalled()
  })

  it('closes the context when unmounted mid-sample', async () => {
    vi.mocked(previewVoice).mockResolvedValue(SAMPLE)
    const { unmount } = renderPicker()

    fireEvent.click(previewButton())
    await waitFor(() => expect(contexts).toHaveLength(1))

    unmount()

    expect(contexts[0].close).toHaveBeenCalled()
  })

  it('throws away audio that finishes synthesising after unmount', async () => {
    let settle: (value: typeof SAMPLE) => void = () => {}
    vi.mocked(previewVoice).mockReturnValue(
      new Promise<typeof SAMPLE>((resolve) => { settle = resolve }),
    )
    const { unmount } = renderPicker()

    fireEvent.click(previewButton())
    unmount()
    settle(SAMPLE)
    await flush()

    expect(contexts).toHaveLength(0)
  })

  it('reports a failed preview', async () => {
    vi.mocked(previewVoice).mockRejectedValue(new Error('The preview was stopped.'))
    renderPicker()

    fireEvent.click(previewButton())

    expect(await screen.findByText('The preview was stopped.')).toBeInTheDocument()
    expect(contexts).toHaveLength(0)
  })
})
