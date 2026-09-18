export function exportSVG(svgEl: SVGSVGElement, title: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const str = new XMLSerializer().serializeToString(clone)
  downloadBlob(new Blob([str], { type: 'image/svg+xml' }), `${title || 'diagram'}.svg`)
}

export async function exportPNG(svgEl: SVGSVGElement, title: string) {
  // Use the SVG's own intrinsic size, not getBoundingClientRect() — the preview
  // shrinks big diagrams to fit the screen via a CSS transform: scale(zoom), so
  // the bounding rect is the on-screen (post-zoom) size, not the diagram's real
  // resolution. Exporting from that under-sized base is what made big diagrams
  // blurry: a diagram fit-to-screen at 20% zoom rendered at 20% of its true
  // pixel size, however much `scale` below multiplied on top of it.
  const vb = svgEl.viewBox.baseVal
  const w = svgEl.width.baseVal.value || vb.width || svgEl.getBoundingClientRect().width || 800
  const h = svgEl.height.baseVal.value || vb.height || svgEl.getBoundingClientRect().height || 600
  // Exporting at native size (now correct) can push very large diagrams past
  // browser canvas dimension limits — cap the longer side instead of failing.
  const MAX_DIM = 8000
  const scale = Math.min(2, MAX_DIM / Math.max(w, h))

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
