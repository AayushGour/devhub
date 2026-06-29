let _cached: Promise<boolean> | null = null

// web-llm needs a real, hardware-backed WebGPU device. A machine can expose the
// `navigator.gpu` API and even hand back an adapter while being unable to actually
// create a usable device/context — that half-present state is what surfaces as
// "Failed to create WebGPU Context Provider" once web-llm tries to use it. So
// checking `requestAdapter() !== null` is not enough: also reject software fallback
// adapters and confirm a device can be created. Anything short of a real device
// routes the app to the CPU worker instead.
export function isWebGpuAvailable(): Promise<boolean> {
  if (_cached) return _cached
  _cached = (async () => {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
      const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
      if (!adapter) return false
      // A fallback adapter is a software rasterizer — too slow/limited for web-llm.
      // `isFallbackAdapter` is a standard GPUAdapter field but missing from the
      // installed @webgpu/types, so read it through a narrow cast.
      if ((adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter) return false
      // requestAdapter() can succeed on a half-initialized GPU stack that still
      // fails at device creation. Probe for a real device before committing.
      const device = await adapter.requestDevice()
      if (!device) return false
      device.destroy()
      return true
    } catch {
      return false
    }
  })()
  return _cached
}
