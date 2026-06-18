import { optimize, type Config } from 'svgo/browser'

const SVGO_CONFIG: Config = {
  multipass: true,
  floatPrecision: 2,
  // svgo v4's preset-default keeps viewBox (removeViewBox is no longer a default
  // plugin); removeDimensions strips width/height so output stays scalable.
  plugins: ['preset-default', 'removeDimensions'],
}

/** Minify + clean a vector SVG. Returns the input unchanged if SVGO fails. */
export function runSvgo(svg: string): string {
  try {
    const { data } = optimize(svg, SVGO_CONFIG)
    return data
  } catch {
    return svg
  }
}

/** Pretty-print SVG with one element per line. */
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

/** Ensure a viewBox and drop fixed width/height so the SVG scales in preview. */
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

export interface SvgStats {
  bytes: number
  paths: number
  nodes: number
  lines: number
}

/** Byte size, path count, total path-node (command) count, and line count. */
export function svgStats(svg: string): SvgStats {
  const bytes = new TextEncoder().encode(svg).length
  const paths = (svg.match(/<path/g) ?? []).length
  const lines = svg.split('\n').length
  let nodes = 0
  for (const m of svg.matchAll(/\bd="([^"]*)"/g)) {
    nodes += (m[1].match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? []).length
  }
  return { bytes, paths, nodes, lines }
}
