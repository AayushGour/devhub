// The GPU probe decides which of two code paths a model runs on, and the
// difference between them is roughly tenfold. Getting it wrong in either
// direction is expensive: too generous and the load dies hundreds of megabytes
// in, too eager to remember a "no" and the whole tab is stuck on the CPU.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const destroy = vi.fn()

/** An adapter that grants a device only when it can meet what is asked of it. */
function adapterWithCap(cap: number) {
  return {
    isFallbackAdapter: false,
    requestDevice: vi.fn(async (options?: { requiredLimits?: Record<string, number> }) => {
      for (const value of Object.values(options?.requiredLimits ?? {})) {
        if (value > cap) throw new Error('requested limits exceed what this adapter supports')
      }
      return { destroy }
    }),
  }
}

function stubGpu(requestAdapter: () => Promise<unknown>) {
  vi.stubGlobal('navigator', { gpu: { requestAdapter } })
}

beforeEach(() => {
  destroy.mockClear()
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isWebGpuAvailable', () => {
  it('asks for nothing extra when the caller asks for nothing — web-llm depends on this', async () => {
    const adapter = adapterWithCap(0)
    stubGpu(async () => adapter)

    const { isWebGpuAvailable } = await import('./webgpu')
    await expect(isWebGpuAvailable()).resolves.toBe(true)
    expect(adapter.requestDevice).toHaveBeenCalledWith(undefined)
  })

  it('refuses an adapter that cannot meet the limits the model needs', async () => {
    // The device is handed over happily when nothing is asked of it; the
    // refusal only happens because the probe asks.
    const adapter = adapterWithCap(128 * 1024 * 1024)
    stubGpu(async () => adapter)

    const { isWebGpuAvailable } = await import('./webgpu')
    await expect(isWebGpuAvailable({ maxBufferSize: 326 * 1024 * 1024 })).resolves.toBe(false)
    await expect(isWebGpuAvailable()).resolves.toBe(true)
  })

  it('re-probes after a failure instead of pinning the tab to the CPU path', async () => {
    let broken = true
    stubGpu(async () => (broken ? null : adapterWithCap(Infinity)))

    const { isWebGpuAvailable } = await import('./webgpu')
    await expect(isWebGpuAvailable()).resolves.toBe(false)

    // A driver reset, another tab holding the GPU, a device lost mid-probe —
    // all transient, and none of them should outlive their cause.
    broken = false
    await expect(isWebGpuAvailable()).resolves.toBe(true)
  })

  it('probes once for a result it can keep', async () => {
    const requestAdapter = vi.fn(async () => adapterWithCap(Infinity))
    stubGpu(requestAdapter)

    const { isWebGpuAvailable } = await import('./webgpu')
    await Promise.all([isWebGpuAvailable(), isWebGpuAvailable()])
    await isWebGpuAvailable()

    expect(requestAdapter).toHaveBeenCalledTimes(1)
  })

  it('rejects a software fallback adapter', async () => {
    stubGpu(async () => ({ isFallbackAdapter: true, requestDevice: vi.fn() }))

    const { isWebGpuAvailable } = await import('./webgpu')
    await expect(isWebGpuAvailable()).resolves.toBe(false)
  })
})
