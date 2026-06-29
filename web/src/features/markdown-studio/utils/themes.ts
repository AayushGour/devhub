export interface Theme {
  id: string
  label: string
  fontBody: string
  fontHeading?: string
  headingFontScope?: 'h123' | 'all'
  lineHeight: number
  headingLetterSpacing?: string
  headingTextTransform?: string
  tableThUppercase?: boolean
  blockquoteExtra?: string
  colors: {
    h1: string
    h2: string
    h3: string
    h456: string
    blockquoteBorder?: string
    blockquoteBg?: string
  }
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    label: 'Classic',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Playfair Display", Georgia, serif',
    headingFontScope: 'all',
    lineHeight: 1.6,
    colors: { h1: '#0f172a', h2: '#0f172a', h3: '#0f172a', h456: '#475569', blockquoteBorder: '#3b82f6' },
  },
  {
    id: 'professional',
    label: 'Professional',
    fontBody: '"Satoshi", "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Plus Jakarta Sans", "Satoshi", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    headingLetterSpacing: '-0.01em',
    colors: { h1: '#0b1324', h2: '#172554', h3: '#1d4ed8', h456: '#334155', blockquoteBorder: '#1d4ed8', blockquoteBg: '#eff6ff' },
    blockquoteExtra: 'border-radius: 0.38rem; padding: 0.65rem 0.9rem;',
  },
  {
    id: 'modern',
    label: 'Modern',
    fontBody: '"Manrope", "DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Manrope", "DM Sans", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    headingLetterSpacing: '-0.02em',
    colors: { h1: '#111827', h2: '#1f2937', h3: '#2563eb', h456: '#4b5563', blockquoteBorder: '#2563eb', blockquoteBg: '#f5f7ff' },
    blockquoteExtra: 'border-left-width: 0.31rem; padding: 0.65rem 0.9rem;',
  },
  {
    id: 'clean',
    label: 'Clean Report',
    fontBody: '"Source Serif 4", Georgia, "Times New Roman", serif',
    fontHeading: '"Playfair Display", "Segoe UI", Arial, serif',
    headingFontScope: 'h123',
    lineHeight: 1.75,
    tableThUppercase: true,
    colors: { h1: '#312e81', h2: '#4338ca', h3: '#6366f1', h456: '#4b5563' },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    fontBody: '"Source Serif 4", Georgia, serif',
    fontHeading: '"Playfair Display", serif',
    headingFontScope: 'all',
    lineHeight: 1.7,
    colors: { h1: '#7c2d12', h2: '#9a3412', h3: '#c2410c', h456: '#57534e' },
  },
  {
    id: 'slate',
    label: 'Slate',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Plus Jakarta Sans", "DM Sans", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    colors: { h1: '#0f172a', h2: '#1e293b', h3: '#334155', h456: '#475569' },
  },
  {
    id: 'nordic',
    label: 'Nordic',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Manrope", "DM Sans", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    colors: { h1: '#0f172a', h2: '#0369a1', h3: '#0284c7', h456: '#475569', blockquoteBorder: '#0ea5e9', blockquoteBg: '#f0f9ff' },
  },
  {
    id: 'royal',
    label: 'Royal',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Playfair Display", Georgia, serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    colors: { h1: '#312e81', h2: '#4338ca', h3: '#6366f1', h456: '#4338ca', blockquoteBorder: '#6366f1', blockquoteBg: '#eef2ff' },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Plus Jakarta Sans", "DM Sans", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    colors: { h1: '#9a3412', h2: '#c2410c', h3: '#ea580c', h456: '#7c2d12' },
  },
  {
    id: 'minimal',
    label: 'Minimal Mono',
    fontBody: '"JetBrains Mono", ui-monospace, monospace',
    fontHeading: '"JetBrains Mono", ui-monospace, monospace',
    headingFontScope: 'all',
    lineHeight: 1.55,
    headingTextTransform: 'uppercase',
    headingLetterSpacing: '0.03em',
    colors: { h1: '#111827', h2: '#1f2937', h3: '#374151', h456: '#374151' },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    fontBody: '"DM Sans", "Segoe UI", Arial, sans-serif',
    fontHeading: '"Plus Jakarta Sans", "DM Sans", "Segoe UI", Arial, sans-serif',
    headingFontScope: 'all',
    lineHeight: 1.55,
    colors: { h1: '#064e3b', h2: '#065f46', h3: '#047857', h456: '#065f46', blockquoteBorder: '#10b981', blockquoteBg: '#ecfdf5' },
  },
]

export const THEME_ACCENT: Record<string, string> = {
  classic: '#3b82f6', professional: '#1d4ed8', modern: '#2563eb',
  clean: '#6366f1', editorial: '#c2410c', slate: '#334155',
  nordic: '#0ea5e9', royal: '#6366f1', sunset: '#ea580c',
  minimal: '#111827', emerald: '#10b981',
}

export function getTheme(id: string): Theme {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Manrope:wght@300..800&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap'

export const FONTSHARE_URL =
  'https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,400&display=swap'
