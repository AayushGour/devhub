export function exportSVG(svgEl: SVGSVGElement, title: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const str = new XMLSerializer().serializeToString(clone)
  downloadBlob(new Blob([str], { type: 'image/svg+xml' }), `${title || 'diagram'}.svg`)
}

export async function exportPNG(svgEl: SVGSVGElement, title: string) {
  const rect = svgEl.getBoundingClientRect()
  const w = rect.width || 800
  const h = rect.height || 600
  const scale = 2

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))

  // data: URL is same-origin — avoids canvas taint from blob URLs
  // when the SVG embeds external font references in its <style> block
  const svgStr = new XMLSerializer().serializeToString(clone)
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)

  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = dataUrl
  })
  ctx.drawImage(img, 0, 0, w, h)

  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, `${title || 'diagram'}.png`)
  }, 'image/png')
}

export function getDiagramHTML(svgEl: SVGSVGElement, title: string): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const svgStr = new XMLSerializer().serializeToString(clone)
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title || 'Diagram'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: flex-start; padding: 20mm; }
    @page { margin: 20mm; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${svgStr}</body>
</html>`
}

export function exportPDF(svgEl: SVGSVGElement, title: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const svgStr = new XMLSerializer().serializeToString(clone)
  const win = window.open('', '_blank')
  if (!win) { alert('Allow popups to export PDF.'); return }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title || 'Diagram'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: flex-start; padding: 20mm; }
    @page { margin: 20mm; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${svgStr}</body>
</html>`)
  win.document.close()
  win.onload = () => { win.print(); win.close() }
  setTimeout(() => { if (!win.closed) { win.print(); win.close() } }, 1500)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
