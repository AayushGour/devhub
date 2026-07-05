import mermaid from 'mermaid'

// Soft lavender palette — preview is always light-background so these
// work for all app themes. Inspired by the gentle node aesthetic.
const SOFT_VARS = {
  primaryColor: '#ede9fc',
  primaryBorderColor: '#8b7fd4',
  primaryTextColor: '#1a1523',
  secondaryColor: '#e0f0ff',
  secondaryBorderColor: '#6098d4',
  secondaryTextColor: '#0f2040',
  tertiaryColor: '#fce9f4',
  tertiaryBorderColor: '#c47ab8',
  tertiaryTextColor: '#3a1030',
  lineColor: '#4a4560',
  edgeLabelBackground: '#f5f3ff',
  clusterBkg: '#f3f0ff',
  clusterBorder: '#bdb4ef',
  titleColor: '#1a1523',
  // 'trebuchet ms' matches mermaid's internal text-width calibration.
  // System fonts (SF Pro/system-ui) render wider than mermaid measures → clipped nodes.
  fontFamily: "'trebuchet ms', verdana, arial, sans-serif",
}

function getThemeVars(_appTheme: string) {
  return {
    theme: 'base' as const,
    themeVariables: {
      background: '#ffffff',
      ...SOFT_VARS,
    },
  }
}

// Reset on each module load so config changes take effect without theme toggle.
let currentTheme = '\0'

export function initMermaid(appTheme: string) {
  if (appTheme === currentTheme) return
  const { theme, themeVariables } = getThemeVars(appTheme)
  mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables,
    securityLevel: 'antiscript',
    // Extra node padding so text doesn't hit clip boundary.
    // System fonts (SF Pro, system-ui) render slightly wider than mermaid measures.
    flowchart: { padding: 16 },
    sequence: { boxMargin: 16 },
  })
  currentTheme = appTheme
}

const VIEWBOX_PAD = 8

function expandSvgViewBoxes(container: HTMLElement) {
  container.querySelectorAll<SVGElement>('pre.mermaid svg').forEach(svg => {
    const vb = svg.getAttribute('viewBox')
    if (!vb) return
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length !== 4 || parts.some(isNaN)) return
    const [x, y, w, h] = parts
    svg.setAttribute('viewBox', `${x - VIEWBOX_PAD} ${y - VIEWBOX_PAD} ${w + VIEWBOX_PAD * 2} ${h + VIEWBOX_PAD * 2}`)

    // Remove ALL clip-path attributes — mermaid applies them to various elements
    // depending on version/securityLevel; brute-force removal is safest.
    svg.querySelectorAll('[clip-path]').forEach(el => el.removeAttribute('clip-path'))

    // Expand foreignObject widths (htmlLabels mode) — mermaid sizes them to measured
    // text width with no buffer, so rendered text can overflow.
    svg.querySelectorAll<SVGForeignObjectElement>('foreignObject').forEach(fo => {
      const w2 = parseFloat(fo.getAttribute('width') ?? '0')
      if (w2 > 0) fo.setAttribute('width', String(w2 + 20))
      fo.style.overflow = 'visible'
    })

    // Expand enclosing rects that match foreignObjects — keeps the visual box in sync.
    svg.querySelectorAll<SVGGElement>('g.label').forEach(g => {
      const fo = g.querySelector('foreignObject')
      const rect = g.querySelector('rect')
      if (fo && rect) {
        const fw = parseFloat(fo.getAttribute('width') ?? '0')
        const rw = parseFloat(rect.getAttribute('width') ?? '0')
        if (fw > rw) rect.setAttribute('width', String(fw))
      }
    })
  })
}

export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre.mermaid')
  if (!blocks.length) return

  blocks.forEach(el => {
    el.removeAttribute('data-processed')
    const svg = el.querySelector('svg')
    if (svg) svg.remove()
  })

  try {
    await mermaid.run({ nodes: Array.from(blocks) })
  } catch {
    // individual block errors shown inline by mermaid
  }

  expandSvgViewBoxes(container)
}
