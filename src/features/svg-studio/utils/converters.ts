function getImageTracer() {
  return import('imagetracerjs').then(m => m.default ?? m)
}

const MAX_DIM = 800

function scaleCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(scaleCanvas(img, MAX_DIM)) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

async function runImageTracer(canvas: HTMLCanvasElement, options: Record<string, unknown>): Promise<string> {
  const IT = await getImageTracer()
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (IT as any).imagedataToSVG(imageData, options)
}

// Panel A — full-color detail
export async function traceDetailed(canvas: HTMLCanvasElement): Promise<string> {
  return runImageTracer(canvas, {
    numberofcolors: 32,
    blurradius: 0,
    blurdelta: 20,
    strokewidth: 1,
    linefilter: false,
    scale: 1,
    roundcoords: 0,
    qtres: 0.5,
    ltres: 0.5,
    viewbox: true,
    desc: false,
  })
}

function removeBackground(src: HTMLCanvasElement, tolerance = 24): HTMLCanvasElement {
  const dst = document.createElement('canvas')
  dst.width = src.width
  dst.height = src.height
  const ctx = dst.getContext('2d')!
  ctx.drawImage(src, 0, 0)

  const imgData = ctx.getImageData(0, 0, dst.width, dst.height)
  const d = imgData.data
  const w = dst.width
  const h = dst.height

  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4]
  const votes: Record<string, number> = {}
  for (const idx of corners) {
    const key = `${d[idx]},${d[idx + 1]},${d[idx + 2]}`
    votes[key] = (votes[key] ?? 0) + 1
  }
  const bgKey = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]
  const [bgR, bgG, bgB] = bgKey.split(',').map(Number)

  for (let i = 0; i < d.length; i += 4) {
    if (
      Math.abs(d[i] - bgR) <= tolerance &&
      Math.abs(d[i + 1] - bgG) <= tolerance &&
      Math.abs(d[i + 2] - bgB) <= tolerance
    ) {
      d[i + 3] = 0
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return dst
}

// Flatten all non-transparent pixels to a single color — kills gradient boundaries
function flattenToOneColor(src: HTMLCanvasElement): HTMLCanvasElement {
  const dst = document.createElement('canvas')
  dst.width = src.width
  dst.height = src.height
  const ctx = dst.getContext('2d')!
  ctx.drawImage(src, 0, 0)

  const imgData = ctx.getImageData(0, 0, dst.width, dst.height)
  const d = imgData.data

  // Find dominant non-transparent color (sample grid)
  const colorCount: Record<string, number> = {}
  for (let i = 0; i < d.length; i += 4 * 8) {
    if (d[i + 3] < 128) continue
    const key = `${Math.round(d[i]/32)*32},${Math.round(d[i+1]/32)*32},${Math.round(d[i+2]/32)*32}`
    colorCount[key] = (colorCount[key] ?? 0) + 1
  }
  const dominant = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]
  const [dr, dg, db] = dominant ? dominant[0].split(',').map(Number) : [0, 0, 0]

  // Flatten: non-transparent → dominant color, fully opaque
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 64) {
      d[i] = dr; d[i + 1] = dg; d[i + 2] = db; d[i + 3] = 255
    } else {
      d[i + 3] = 0
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return dst
}

// Panel B — simplified: no background, binary colors, high simplification → few clean paths
export async function traceSimplified(canvas: HTMLCanvasElement): Promise<string> {
  const noBg = removeBackground(canvas)
  const binary = flattenToOneColor(noBg)
  return runImageTracer(binary, {
    numberofcolors: 2,
    blurradius: 1,
    blurdelta: 64,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 0,
    pathomit: 16,
    qtres: 5,
    ltres: 5,
    viewbox: true,
    desc: false,
  })
}

export function buildEmbedSvg(file: File, canvas: HTMLCanvasElement): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target!.result as string
      const w = canvas.width
      const h = canvas.height
      resolve(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
        `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<image width="${w}" height="${h}" xlink:href="${dataUrl}"/>` +
        `</svg>`
      )
    }
    reader.readAsDataURL(file)
  })
}

// Strip imagetracerjs bloat: zero-width strokes, near-1 opacity, rgb()→hex, decimal rounding
export function minifySvg(svg: string): string {
  return svg
    // rgb(r,g,b) → #rrggbb
    .replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (_, r, g, b) =>
      '#' + [r, g, b].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
    )
    // Round floats to 2 decimals in path d="" (1 decimal causes visible jaggies)
    .replace(/\bd="([^"]*)"/g, (_, d) =>
      `d="${d.replace(/-?\d+\.\d{3,}/g, n => parseFloat(n).toFixed(2))}"`
    )
    // Remove opacity when ≥ 0.99 (effectively 1)
    .replace(/\s+opacity="0\.9\d{2,}[^"]*"/g, '')
    .replace(/\s+opacity="1(?:\.0+)?"/g, '')
    // Remove stroke + stroke-width when stroke-width=0 (imagetracerjs always emits these)
    .replace(/\s+stroke="[^"]*"(\s+stroke-width="0"|\s+stroke-width="[^"]*")?\s+stroke-width="0"/g, '')
    .replace(/\s+stroke-width="0"\s+stroke="[^"]*"/g, '')
    .replace(/\s+stroke-width="0"/g, '')
    .replace(/\s+stroke="[^"]*"(?=\s+(?:opacity|d|fill|class|id)=)/g, '')
    // Remove version, desc
    .replace(/\s+version="[^"]*"/g, '')
    .replace(/\s+desc="[^"]*"/g, '')
    // Compact whitespace between tags
    .replace(/>\s+</g, '><')
    .trim()
}

export function formatSvg(svg: string): string {
  let indent = 0
  return svg
    .replace(/></g, '>\n<')
    .split('\n')
    .map(line => {
      line = line.trim()
      if (!line) return ''
      if (line.startsWith('</')) {
        indent = Math.max(0, indent - 1)
        return '  '.repeat(indent) + line
      }
      const r = '  '.repeat(indent) + line
      if (!line.endsWith('/>') && !line.startsWith('<!--') && !line.startsWith('<?')) indent++
      return r
    })
    .filter(Boolean)
    .join('\n')
}

export function normalizeSvgForDisplay(svg: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const svgEl = doc.querySelector('svg')
  if (!svgEl) return svg
  const w = svgEl.getAttribute('width')
  const h = svgEl.getAttribute('height')
  if (!svgEl.getAttribute('viewBox') && w && h) {
    svgEl.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`)
  }
  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')
  return new XMLSerializer().serializeToString(doc)
}

export function svgStats(svg: string) {
  const bytes = new TextEncoder().encode(svg).length
  const paths = (svg.match(/<path/g) ?? []).length
  const lines = svg.split('\n').length
  return { bytes, paths, lines }
}
