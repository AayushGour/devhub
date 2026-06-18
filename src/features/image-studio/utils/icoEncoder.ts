// Embeds a PNG image inside an ICO container (supported since Windows Vista / IE9)
export async function encodeIco(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG for ICO'))
    }, 'image/png')
  })

  const pngBuffer = await pngBlob.arrayBuffer()
  const pngBytes = new Uint8Array(pngBuffer)

  // ICO = ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + image data
  const headerSize = 22
  const buffer = new ArrayBuffer(headerSize + pngBytes.length)
  const view = new DataView(buffer)

  // ICONDIR
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type = 1 (ICO)
  view.setUint16(4, 1, true) // count = 1

  // ICONDIRENTRY
  const w = Math.min(canvas.width, 256)
  const h = Math.min(canvas.height, 256)
  view.setUint8(6, w === 256 ? 0 : w)   // 0 means 256 in ICO spec
  view.setUint8(7, h === 256 ? 0 : h)
  view.setUint8(8, 0)    // color count (0 = no palette)
  view.setUint8(9, 0)    // reserved
  view.setUint16(10, 1, true)  // planes
  view.setUint16(12, 32, true) // bits per pixel
  view.setUint32(14, pngBytes.length, true) // image data size
  view.setUint32(18, headerSize, true)       // image data offset

  new Uint8Array(buffer).set(pngBytes, headerSize)

  return new Blob([buffer], { type: 'image/x-icon' })
}
