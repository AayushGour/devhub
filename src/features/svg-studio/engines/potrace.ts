import { traceBitmap, Bitmap, type TraceOptions, type TracedPath } from 'potrace-js/src/index.js'
import type { TraceContext, TraceParams } from './types'

function getImageData(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
}

function optsFrom(params: TraceParams): TraceOptions {
  return {
    turnpolicy: 'minority',
    optcurve: true,
    turdsize: Number(params.turdsize ?? 2),
    alphamax: Number(params.alphamax ?? 1),
    opttolerance: Number(params.opttolerance ?? 0.2),
  }
}

// Serialize a traced path list into one SVG path `d`. potrace contours are
// closed loops, so each subpath is terminated with Z; combined with
// fill-rule:evenodd this renders holes (e.g. the centre of an "O") correctly.
function pathListToD(pathList: TracedPath[]): string {
  let d = ''
  for (const { curve } of pathList) {
    const { n, c, tag } = curve
    const f = (v: number) => v.toFixed(2)
    d += `M${f(c[(n - 1) * 3 + 2].x)} ${f(c[(n - 1) * 3 + 2].y)} `
    for (let i = 0; i < n; i++) {
      if (tag[i] === 'CURVE') {
        d += `C${f(c[i * 3].x)} ${f(c[i * 3].y)} ${f(c[i * 3 + 1].x)} ${f(c[i * 3 + 1].y)} ${f(c[i * 3 + 2].x)} ${f(c[i * 3 + 2].y)} `
      } else {
        d += `L${f(c[i * 3 + 1].x)} ${f(c[i * 3 + 1].y)} ${f(c[i * 3 + 2].x)} ${f(c[i * 3 + 2].y)} `
      }
    }
    d += 'Z'
  }
  return d
}

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function svgOpen(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
}

/** Mono: threshold to a single-color bitmap, then trace one contour set. */
export async function traceMono({ canvas }: TraceContext, params: TraceParams): Promise<string> {
  const { width: w, height: h, data } = getImageData(canvas)
  const threshold = Number(params.threshold ?? 128)
  const bmp = new Bitmap(w, h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const lum = 0.2126 * data[p] + 0.7153 * data[p + 1] + 0.0721 * data[p + 2]
    bmp.data[i] = data[p + 3] >= 128 && lum < threshold ? 1 : 0
  }
  const d = pathListToD(traceBitmap(bmp, optsFrom(params)))
  return `${svgOpen(w, h)}<path d="${d}" fill="#000000" fill-rule="evenodd"/></svg>`
}

interface Palette {
  colors: [number, number, number][] // representative rgb per cluster
  labels: Int32Array // cluster index per pixel, -1 for transparent
  counts: number[] // pixel count per cluster
}

// Quantize opaque pixels to the `n` most frequent colors (5-bit/channel
// buckets), then assign every opaque pixel to its nearest palette colour.
function quantize(data: Uint8ClampedArray, count: number, n: number): Palette {
  const buckets = new Map<number, { r: number; g: number; b: number; c: number }>()
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    if (data[p + 3] < 128) continue
    const key = ((data[p] >> 3) << 10) | ((data[p + 1] >> 3) << 5) | (data[p + 2] >> 3)
    const b = buckets.get(key)
    if (b) {
      b.r += data[p]; b.g += data[p + 1]; b.b += data[p + 2]; b.c++
    } else {
      buckets.set(key, { r: data[p], g: data[p + 1], b: data[p + 2], c: 1 })
    }
  }
  const top = [...buckets.values()].sort((a, b) => b.c - a.c).slice(0, n)
  const colors: [number, number, number][] = top.map(b => [b.r / b.c, b.g / b.c, b.b / b.c])

  const labels = new Int32Array(count).fill(-1)
  const counts = new Array(colors.length).fill(0)
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    if (data[p + 3] < 128) continue
    let best = 0
    let bestDist = Infinity
    for (let k = 0; k < colors.length; k++) {
      const dr = data[p] - colors[k][0]
      const dg = data[p + 1] - colors[k][1]
      const db = data[p + 2] - colors[k][2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) { bestDist = dist; best = k }
    }
    labels[i] = best
    counts[best]++
  }
  return { colors, labels, counts }
}

/** Color: posterize to N colours, trace each as its own layer (largest first). */
export async function traceColor({ canvas }: TraceContext, params: TraceParams): Promise<string> {
  const { width: w, height: h, data } = getImageData(canvas)
  const n = Number(params.colorcount ?? 5)
  const { colors, labels, counts } = quantize(data, w * h, n)
  const opts = optsFrom(params)

  // One pass to populate every layer's bitmap (vs one pass per colour).
  const bitmaps = colors.map(() => new Bitmap(w, h))
  for (let i = 0; i < w * h; i++) {
    const k = labels[i]
    if (k >= 0) bitmaps[k].data[i] = 1
  }

  // Largest-coverage layers first so finer details paint on top.
  const order = colors.map((_, k) => k).sort((a, b) => counts[b] - counts[a])

  let body = ''
  for (const k of order) {
    if (counts[k] === 0) continue
    const pathList = traceBitmap(bitmaps[k], opts)
    if (!pathList.length) continue
    const d = pathListToD(pathList)
    body += `<path d="${d}" fill="${hex(colors[k][0], colors[k][1], colors[k][2])}" fill-rule="evenodd"/>`
  }
  return `${svgOpen(w, h)}${body}</svg>`
}
