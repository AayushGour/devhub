// Output is vector (resolution-independent); a larger input bitmap yields
// smoother traces while SVGO keeps the byte size small. Capped so the color
// tracer (one pass per palette colour, in JS) stays responsive.
const MAX_DIM = 1000

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
  // Multiple engines read this canvas back via getImageData; the hint avoids
  // the browser's repeated-readback deopt.
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, w, h)
  return canvas
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(scaleCanvas(img, MAX_DIM))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
