import type { Theme } from './themes'

export interface DocumentSettings {
  fontFamily: string
  color: string
  backgroundColor: string
  borderWidth: string
  borderStyle: string
  borderColor: string
  borderRadius: string
  padding: string
}

export interface ElementRule {
  selector: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  textTransform: string
  color: string
  backgroundColor: string
  borderWidth: string
  borderStyle: string
  borderColor: string
  borderRadius: string
  padding: string
  margin: string
}

export interface StyleSettings {
  document: DocumentSettings
  rules: ElementRule[]
}

export const COMMON_SELECTORS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'li', 'blockquote',
  'pre', 'code', 'table', 'th', 'td',
  'a', 'strong', 'em',
]

export const FONT_OPTIONS = [
  { label: 'Default (theme)', value: '' },
  { label: 'DM Sans', value: '"DM Sans", "Segoe UI", Arial, sans-serif' },
  { label: 'Manrope', value: '"Manrope", "DM Sans", "Segoe UI", Arial, sans-serif' },
  { label: 'Plus Jakarta Sans', value: '"Plus Jakarta Sans", "DM Sans", "Segoe UI", Arial, sans-serif' },
  { label: 'Satoshi', value: '"Satoshi", "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif' },
  { label: 'Playfair Display', value: '"Playfair Display", Georgia, serif' },
  { label: 'Source Serif 4', value: '"Source Serif 4", Georgia, "Times New Roman", serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", ui-monospace, monospace' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
]

export const BORDER_STYLE_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
  { label: 'Double', value: 'double' },
  { label: 'None', value: 'none' },
]

const RULE_PROP_MAP: Record<keyof Omit<ElementRule, 'selector'>, string> = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  textTransform: 'text-transform',
  color: 'color',
  backgroundColor: 'background',
  borderWidth: 'border-width',
  borderStyle: 'border-style',
  borderColor: 'border-color',
  borderRadius: 'border-radius',
  padding: 'padding',
  margin: 'margin',
}

function sanitize(value: string) {
  return String(value || '').replace(/[{};]/g, '').trim()
}

function buildDecls(obj: Record<string, string>): string {
  const parts: string[] = []

  // Standard properties (border-width/style/color handled separately as shorthand)
  const BORDER_LONGHAND_KEYS = new Set(['borderWidth', 'borderStyle', 'borderColor'])
  for (const [key, css] of Object.entries(RULE_PROP_MAP)) {
    if (BORDER_LONGHAND_KEYS.has(key)) continue
    const v = sanitize(obj[key] ?? '')
    if (v) parts.push(`${css}: ${v};`)
  }

  // Combine into `border` shorthand — if any border property is set, supply defaults for the
  // others so the border always renders (border-style defaults to "none" in browsers, which
  // silently hides a border even when width and color are explicitly set).
  const bw = sanitize(obj.borderWidth ?? '')
  const bs = sanitize(obj.borderStyle ?? '')
  const bc = sanitize(obj.borderColor ?? '')
  if (bw || bs || bc) {
    parts.push(`border: ${bw || '1px'} ${bs || 'solid'} ${bc || 'currentColor'};`)
  }

  return parts.join(' ')
}

function scopeSelector(root: string, selector: string): string {
  return selector.split(',').map(s => `${root} ${s.trim()}`).join(', ')
}

export function buildCustomCss(settings: StyleSettings, root: string): string {
  const chunks: string[] = []

  const docDecl = buildDecls(settings.document as unknown as Record<string, string>)
  if (docDecl) chunks.push(`${root} { ${docDecl} }`)

  for (const rule of settings.rules) {
    const sel = rule.selector.trim()
    if (!sel) continue
    const decl = buildDecls(rule as unknown as Record<string, string>)
    if (!decl) continue
    chunks.push(`${scopeSelector(root, sel)} { ${decl} }`)
  }

  return chunks.join('\n')
}

export function themeToCss(theme: Theme, root: string): string {
  const scoped = (sel: string) => sel.split(',').map(s => `${root} ${s.trim()}`).join(', ')
  const lines: string[] = []

  lines.push(`${root} { font-family: ${theme.fontBody}; line-height: ${theme.lineHeight}; }`)

  if (theme.headingLetterSpacing)
    lines.push(`${scoped('h1,h2,h3,h4,h5,h6')} { letter-spacing: ${theme.headingLetterSpacing}; }`)
  if (theme.headingTextTransform)
    lines.push(`${scoped('h1,h2,h3,h4,h5,h6')} { text-transform: ${theme.headingTextTransform}; }`)
  if (theme.fontHeading) {
    const scope = theme.headingFontScope === 'all' ? 'h1,h2,h3,h4,h5,h6' : 'h1,h2,h3'
    lines.push(`${scoped(scope)} { font-family: ${theme.fontHeading}; }`)
  }

  const { h1, h2, h3, h456 } = theme.colors
  lines.push(`${scoped('h1')} { color: ${h1}; }`)
  lines.push(`${scoped('h2')} { color: ${h2}; }`)
  lines.push(`${scoped('h3')} { color: ${h3}; }`)
  lines.push(`${scoped('h4,h5,h6')} { color: ${h456}; }`)

  const { blockquoteBorder, blockquoteBg } = theme.colors
  if (blockquoteBorder || blockquoteBg) {
    const parts = []
    if (blockquoteBorder) parts.push(`border-left-color: ${blockquoteBorder};`)
    if (blockquoteBg) parts.push(`background: ${blockquoteBg};`)
    lines.push(`${scoped('blockquote')} { ${parts.join(' ')} }`)
  }
  if (theme.blockquoteExtra)
    lines.push(`${scoped('blockquote')} { ${theme.blockquoteExtra} }`)
  if (theme.tableThUppercase)
    lines.push(`${scoped('table th')} { text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.78rem; }`)

  return lines.join('\n')
}

export function createDefaultSettings(): StyleSettings {
  return {
    document: {
      fontFamily: '', color: '', backgroundColor: '',
      borderWidth: '', borderStyle: '', borderColor: '',
      borderRadius: '', padding: '',
    },
    rules: [],
  }
}

export function createDefaultRule(selector = ''): ElementRule {
  return {
    selector, fontFamily: '', fontSize: '', fontWeight: '',
    lineHeight: '', letterSpacing: '', textTransform: '',
    color: '', backgroundColor: '', borderWidth: '',
    borderStyle: '', borderColor: '', borderRadius: '',
    padding: '', margin: '',
  }
}
