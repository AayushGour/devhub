import { encodeBmp } from './bmpEncoder'
import { encodeIco } from './icoEncoder'
import type { OutputFormat } from './formatInfo'

export interface ConversionOptions {
  format: OutputFormat
  quality: number         // 1–100
  width?: number
  height?: number
  maintainAspectRatio: boolean
}

function computeDimensions(
  srcW: number, srcH: number,
  targetW: number | undefined, targetH: number | undefined,
  maintain: boolean
): { w: number; h: number } {
  if (!targetW && !targetH) return { w: srcW, h: srcH }

  if (maintain) {
    if (targetW && !targetH) return { w: targetW, h: Math.round(srcH * (targetW / srcW)) }
    if (!targetW && targetH) return { w: Math.round(srcW * (targetH / srcH)), h: targetH }
    if (targetW && targetH) {
      const ratio = Math.min(targetW / srcW, targetH / srcH)
      return { w: Math.round(srcW * ratio), h: Math.round(srcH * ratio) }
    }
  }

  return { w: targetW ?? srcW, h: targetH ?? srcH }
}

async function imageToCanvas(
  file: File,
  opts: ConversionOptions
): Promise<HTMLCanvasElement> {
  const isTiff = file.type === 'image/tiff' || /\.tiff?$/i.test(file.name)

  let srcW: number
  let srcH: number
  let drawSource: HTMLImageElement | HTMLCanvasElement

  if (isTiff) {
    const { decode, decodeImage, toRGBA8 } = await import('utif')
    const buf = await file.arrayBuffer()
    const ifds = decode(buf)
    if (!ifds.length) throw new Error('No TIFF frames found')
    decodeImage(buf, ifds[0], ifds)
    const rgba = toRGBA8(ifds[0])
    srcW = ifds[0].width
    srcH = ifds[0].height
    const tiffCanvas = document.createElement('canvas')
    tiffCanvas.width = srcW
    tiffCanvas.height = srcH
    const ctx = tiffCanvas.getContext('2d')!
    const imgData = ctx.createImageData(srcW, srcH)
    imgData.data.set(rgba)
    ctx.putImageData(imgData, 0, 0)
    drawSource = tiffCanvas
  } else {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const el = new Image()
      el.onload = () => { URL.revokeObjectURL(url); resolve(el) }
      el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to decode image')) }
      el.src = url
    })
    srcW = img.naturalWidth
    srcH = img.naturalHeight
    drawSource = img
  }

  const { w, h } = computeDimensions(srcW, srcH, opts.width, opts.height, opts.maintainAspectRatio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(drawSource, 0, 0, w, h)
  return canvas
}

export async function convertImage(file: File, opts: ConversionOptions): Promise<Blob> {
  const canvas = await imageToCanvas(file, opts)

  if (opts.format === 'bmp') return encodeBmp(canvas)
  if (opts.format === 'ico') return encodeIco(canvas)

  if (opts.format === 'gif') {
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
    const ctx = canvas.getContext('2d')!
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const rgba = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data)
    const palette = quantize(rgba, 256, { format: 'rgb565' })
    const indexed = applyPalette(rgba, palette, 'rgb565')
    const encoder = GIFEncoder()
    encoder.writeFrame(indexed, width, height, { palette })
    encoder.finish()
    const gifBytes = encoder.bytes()
    const gifBuf = gifBytes.buffer.slice(gifBytes.byteOffset, gifBytes.byteOffset + gifBytes.byteLength) as ArrayBuffer
    return new Blob([gifBuf], { type: 'image/gif' })
  }

  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
  }
  const mime = mimeMap[opts.format]
  const q = ['jpeg', 'webp', 'avif'].includes(opts.format) ? opts.quality / 100 : undefined

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, mime, q)
  })

  if (!blob) throw new Error(`Browser does not support encoding ${opts.format.toUpperCase()}`)
  return blob
}
