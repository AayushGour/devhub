/**
 * Minimum device limits a probe insists on: `GPUSupportedLimits` keys mapped to
 * the smallest value each must reach. Passed straight through as
 * `requiredLimits`.
 */
export type WebGpuLimits = Record<string, number>

/**
 * Probes that are in flight or have already succeeded, keyed by the limits they
 * asked for. Different consumers want different things of the GPU — web-llm and
 * onnxruntime do not need the same headroom — so a single cached answer cannot
 * serve them all.
 */
const probes = new Map<string, Promise<boolean>>()

/**
 * Can this machine actually run a model on the GPU?
 *
 * A machine can expose the `navigator.gpu` API and even hand back an adapter
 * while being unable to create a usable device/context — that half-present
 * state is what surfaces as "Failed to create WebGPU Context Provider" once a
 * runtime tries to use it. So checking `requestAdapter() !== null` is not
 * enough: software fallback adapters are rejected and a real device is created
 * before we commit. Anything short of that routes the app to the CPU path.
 *
 * Pass the limits the model in question needs. A device created with no
 * `requiredLimits` gets the spec defaults — 128 MB per storage binding, 256 MB
 * per buffer — so an adapter nowhere near able to host a several-hundred-
 * megabyte model still hands one back, and the truth only arrives while the
 * weights are being uploaded, long after the download has been paid for.
 * Callers needing more than the defaults must say so.
 */
export function isWebGpuAvailable(limits?: WebGpuLimits): Promise<boolean> {
  const key = limits ? JSON.stringify(Object.entries(limits).sort()) : ''
  const pending = probes.get(key)
  if (pending) return pending

  const probe = probeDevice(limits).then((ok) => {
    // Only a positive answer is durable. A `false` can come from a transient
    // failure — a driver reset, another tab holding the GPU, a device lost
    // mid-probe — and memoising that would pin the rest of the tab's life to
    // the far slower CPU path with no way back short of a reload.
    if (!ok) probes.delete(key)
    return ok
  })
  probes.set(key, probe)
  return probe
}

async function probeDevice(requiredLimits?: WebGpuLimits): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
    if (!adapter) return false
    // A fallback adapter is a software rasterizer — too slow and too limited to
    // be worth routing a model to.
    // `isFallbackAdapter` is a standard GPUAdapter field but missing from the
    // installed @webgpu/types, so read it through a narrow cast.
    if ((adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter) return false
    // requestAdapter() can succeed on a half-initialized GPU stack that still
    // fails at device creation. Probe for a real device — with the caller's
    // limits — before committing: requestDevice rejects outright when the
    // adapter cannot meet them, which is precisely the answer being asked for.
    const device = await adapter.requestDevice(requiredLimits ? { requiredLimits } : undefined)
    if (!device) return false
    device.destroy()
    return true
  } catch {
    return false
  }
}
