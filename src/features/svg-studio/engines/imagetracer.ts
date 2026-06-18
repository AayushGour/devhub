import type { TraceContext, TraceParams } from './types'

function getImageTracer() {
  return import('imagetracerjs').then(m => m.default ?? m)
}

/** Color-region tracer — kept for complex / gradient-ish images. */
export async function trace({ canvas }: TraceContext, params: TraceParams): Promise<string> {
  const IT = await getImageTracer()
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (IT as any).imagedataToSVG(imageData, { viewbox: true, desc: false, ...params })
}
