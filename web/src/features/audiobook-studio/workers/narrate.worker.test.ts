// The narration worker's message contract.
//
// Every request must produce exactly one terminal response. A request that is
// silently satisfied — a model load when the model is already resident — still
// has to answer, or the caller's promise never settles and the UI hangs with no
// error to show.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const generate = vi.fn(async () => ({
  audio: new Float32Array(2400),
  sampling_rate: 24000,
}))

const fromPretrained = vi.fn(async () => ({ generate }))

vi.mock('kokoro-js', () => ({
  KokoroTTS: { from_pretrained: () => fromPretrained() },
}))

interface Posted { type: string; [key: string]: unknown }

const posted: Posted[] = []

/** Drive the worker's own message handler and collect what it posts back. */
async function send(message: unknown): Promise<void> {
  const handler = (self as unknown as { onmessage: (e: MessageEvent) => unknown }).onmessage
  await handler({ data: message } as MessageEvent)
  // Let any microtasks the handler queued settle before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(async () => {
  posted.length = 0
  vi.stubGlobal('postMessage', (message: Posted) => { posted.push(message) })
  vi.stubGlobal('performance', { now: () => 0 })
  fromPretrained.mockClear()
  // The worker keeps the loaded model in module state, so each test needs a
  // fresh evaluation or the second one starts with a model already resident.
  vi.resetModules()
  await import('./narrate.worker')
})

const LOAD = { requestId: 1, type: 'load', dtype: 'fp32', device: 'webgpu' }

describe('narrate worker protocol', () => {
  it('answers the first load with ready', async () => {
    await send(LOAD)
    expect(posted.filter((m) => m.type === 'ready')).toHaveLength(1)
  })

  it('answers a repeated load with ready even though the model is resident', async () => {
    await send(LOAD)
    posted.length = 0

    await send({ ...LOAD, requestId: 2 })

    // Without a response here the caller awaits forever — this is the hang.
    expect(posted.filter((m) => m.type === 'ready')).toHaveLength(1)
    // ...and the model must not be fetched a second time.
    expect(fromPretrained).toHaveBeenCalledTimes(1)
  })

  it('answers an invalid device/dtype pairing with an error rather than silence', async () => {
    await send({ requestId: 7, type: 'load', dtype: 'q8', device: 'webgpu' })

    const errors = posted.filter((m) => m.type === 'error')
    expect(errors).toHaveLength(1)
    // The caller can only settle the right promise if the id comes back.
    expect(errors[0].requestId).toBe(7)
  })

  it('echoes the request id so concurrent callers can tell responses apart', async () => {
    await send(LOAD)
    posted.length = 0

    // A voice preview arriving while something else is in flight must answer
    // its own id, not simply the newest one.
    await send({ requestId: 42, type: 'sample', voice: 'af_heart', text: 'Hello.', speed: 1 })

    const samples = posted.filter((m) => m.type === 'sample')
    expect(samples).toHaveLength(1)
    expect(samples[0].requestId).toBe(42)
  })
})
