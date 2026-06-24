let _cached: Promise<boolean> | null = null

export function isWebGpuAvailable(): Promise<boolean> {
  if (_cached) return _cached
  _cached = (async () => {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
      // requestAdapter() returns null when no compatible GPU is found
      const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
      return adapter !== null
    } catch {
      return false
    }
  })()
  return _cached
}
