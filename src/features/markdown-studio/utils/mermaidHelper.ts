import mermaid from 'mermaid'

function getThemeVars(appTheme: string) {
  switch (appTheme) {
    case 'light':
      return {
        theme: 'base' as const,
        themeVariables: {
          background: '#ffffff',
          primaryColor: '#dbeafe',
          primaryBorderColor: '#3b82f6',
          primaryTextColor: '#1e3a8a',
          secondaryColor: '#dcfce7',
          secondaryBorderColor: '#16a34a',
          secondaryTextColor: '#14532d',
          tertiaryColor: '#fef3c7',
          tertiaryBorderColor: '#d97706',
          tertiaryTextColor: '#78350f',
          lineColor: '#6e6e73',
          edgeLabelBackground: '#f0f4ff',
          clusterBkg: '#f0f9ff',
          clusterBorder: '#bae6fd',
          titleColor: '#1d1d1f',
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
        },
      }

    case 'dark':
      return {
        theme: 'base' as const,
        themeVariables: {
          background: '#1d1d1f',
          primaryColor: '#1a4a7a',
          primaryBorderColor: '#2997ff',
          primaryTextColor: '#e8f1ff',
          secondaryColor: '#0f3d2b',
          secondaryBorderColor: '#30d158',
          secondaryTextColor: '#d4f7e2',
          tertiaryColor: '#4a2a00',
          tertiaryBorderColor: '#ff9f0a',
          tertiaryTextColor: '#ffecc7',
          lineColor: '#a1a1a6',
          edgeLabelBackground: '#272729',
          clusterBkg: '#272729',
          clusterBorder: '#3a3a3c',
          titleColor: '#f5f5f7',
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
        },
      }

    case 'github':
      return {
        theme: 'base' as const,
        themeVariables: {
          background: '#0d1117',
          primaryColor: '#0d419d',
          primaryBorderColor: '#58a6ff',
          primaryTextColor: '#cae8ff',
          secondaryColor: '#0f5132',
          secondaryBorderColor: '#3fb950',
          secondaryTextColor: '#aff5b4',
          tertiaryColor: '#5a1e02',
          tertiaryBorderColor: '#f78166',
          tertiaryTextColor: '#ffa198',
          lineColor: '#8b949e',
          edgeLabelBackground: '#161b22',
          clusterBkg: '#161b22',
          clusterBorder: '#30363d',
          titleColor: '#e6edf3',
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
        },
      }

    case 'nord':
      return {
        theme: 'base' as const,
        themeVariables: {
          background: '#2e3440',
          primaryColor: '#5e81ac',
          primaryBorderColor: '#88c0d0',
          primaryTextColor: '#eceff4',
          secondaryColor: '#4a6741',
          secondaryBorderColor: '#a3be8c',
          secondaryTextColor: '#eceff4',
          tertiaryColor: '#6e4e2a',
          tertiaryBorderColor: '#ebcb8b',
          tertiaryTextColor: '#eceff4',
          lineColor: '#d8dee9',
          edgeLabelBackground: '#3b4252',
          clusterBkg: '#3b4252',
          clusterBorder: '#4c566a',
          titleColor: '#eceff4',
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
        },
      }

    case 'dracula':
      return {
        theme: 'base' as const,
        themeVariables: {
          background: '#282a36',
          primaryColor: '#6272a4',
          primaryBorderColor: '#bd93f9',
          primaryTextColor: '#f8f8f2',
          secondaryColor: '#2d5a2d',
          secondaryBorderColor: '#50fa7b',
          secondaryTextColor: '#f8f8f2',
          tertiaryColor: '#5a2d4a',
          tertiaryBorderColor: '#ff79c6',
          tertiaryTextColor: '#f8f8f2',
          lineColor: '#f8f8f2',
          edgeLabelBackground: '#44475a',
          clusterBkg: '#44475a',
          clusterBorder: '#6272a4',
          titleColor: '#f8f8f2',
          fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif",
        },
      }

    default:
      return { theme: 'default' as const, themeVariables: {} }
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
