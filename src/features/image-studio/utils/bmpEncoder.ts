export function encodeBmp(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const rowStride = width * 3
  const paddedStride = Math.ceil(rowStride / 4) * 4
  const padding = paddedStride - rowStride
  const pixelArraySize = paddedStride * height
  const fileSize = 54 + pixelArraySize

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42) // 'B'
  view.setUint8(1, 0x4d) // 'M'
  view.setUint32(2, fileSize, true)
  view.setUint32(6, 0, true)  // reserved
  view.setUint32(10, 54, true) // pixel data offset

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true)      // header size
  view.setInt32(18, width, true)
  view.setInt32(22, -height, true)  // negative = top-down storage
  view.setUint16(26, 1, true)       // color planes
  view.setUint16(28, 24, true)      // bits per pixel (24-bit RGB)
  view.setUint32(30, 0, true)       // no compression
  view.setUint32(34, pixelArraySize, true)
  view.setUint32(38, 2835, true)    // ~72 DPI X
  view.setUint32(42, 2835, true)    // ~72 DPI Y
  view.setUint32(46, 0, true)
  view.setUint32(50, 0, true)

  // Pixel data: BGR rows, top-down (via negative height)
  const bytes = new Uint8Array(buffer)
  let offset = 54
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      bytes[offset++] = data[i + 2] // B
      bytes[offset++] = data[i + 1] // G
      bytes[offset++] = data[i]     // R
    }
    for (let p = 0; p < padding; p++) bytes[offset++] = 0
  }

  return new Blob([buffer], { type: 'image/bmp' })
}
