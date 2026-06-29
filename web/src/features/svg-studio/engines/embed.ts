import type { TraceContext } from './types'

/** Raster escape hatch — wraps the original image as a base64 <image>. */
export function trace({ file, canvas }: TraceContext): Promise<string> {
  return new Promise((resolve, reject) => {
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
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
