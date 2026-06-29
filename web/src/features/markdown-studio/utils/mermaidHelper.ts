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
  fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
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

let currentTheme = ''

export function initMermaid(appTheme: string) {
  if (appTheme === currentTheme) return
  const { theme, themeVariables } = getThemeVars(appTheme)
  mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables,
    securityLevel: 'antiscript',
  })
  currentTheme = appTheme
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
}
