// Slide Deck markdown convention: split + per-slide config extraction.
// Kept separate from parser.ts's continuous-doc path — parser.ts's splitFrontmatter
// is private and never called here (see project-context.md Architecture).
import { parse as parseYaml } from 'yaml'
import type { ComponentType } from 'react'
import type { SlideFooter, SlideStyle } from './slideStyle'
import { validateSlideStyle, validateSlideFooter } from './slideStyle'

export type SlideType = 'title' | 'section' | 'content' | 'two-column' | 'image-focus'

const SLIDE_TYPES: readonly SlideType[] = ['title', 'section', 'content', 'two-column', 'image-focus']

function isSlideType(v: unknown): v is SlideType {
  return typeof v === 'string' && (SLIDE_TYPES as readonly string[]).includes(v)
}

// One raw slide source segment, post-split (pre-yaml-extraction).
export interface SlideChunk {
  raw: string
}

export interface SlideConfig {
  type: SlideType // always resolved; fallback 'content'
  title?: string
  subtitle?: string
  author?: string
  date?: string
  image?: string
  caption?: string
  columns?: [string, string]
  body: string // raw body markdown (may be '')
  notes?: string
  footer?: SlideFooter
  style?: SlideStyle
  rawFenceFallback?: string // malformed-yaml raw text folded into body (visible, not dropped)
}

// Layout render signature — receives ALREADY-RENDERED html; never parses markdown itself.
export interface SlideRenderInput {
  config: SlideConfig
  bodyHtml: string
  columnsHtml?: [string, string]
  captionHtml?: string
}

export type SlideLayout = ComponentType<SlideRenderInput>

const YAML_FENCE_RE = /^```yaml[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/

/**
 * Splits raw deck markdown into slide chunks on standalone `---` lines. Fence-aware:
 * tracks whether the scan is inside a ``` code block and ignores `---`-looking lines
 * while inside one (e.g. inside a mermaid block), so a fenced block's own content
 * never fractures the deck. Leading/trailing empty chunks are dropped; a `---` line
 * itself is never included in either adjacent chunk.
 */
export function splitSlides(raw: string): SlideChunk[] {
  const lines = raw.split(/\r?\n/)
  const chunks: string[] = []
  let current: string[] = []
  let inFence = false

  const FENCE_OPEN_CLOSE_RE = /^\s*```/
  const SEPARATOR_RE = /^\s*---\s*$/

  for (const line of lines) {
    if (FENCE_OPEN_CLOSE_RE.test(line)) {
      inFence = !inFence
      current.push(line)
      continue
    }
    if (!inFence && SEPARATOR_RE.test(line)) {
      chunks.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  chunks.push(current.join('\n'))

  return chunks
    .map(c => c.trim())
    .filter(c => c.length > 0)
    .map(raw => ({ raw }))
}

function padColumns(cols: unknown): [string, string] {
  const arr = Array.isArray(cols) ? cols.filter((c): c is string => typeof c === 'string') : []
  return [arr[0] ?? '', arr[1] ?? '']
}

/**
 * Extracts per-slide config from a chunk. If the chunk opens with a fenced ```yaml
 * block, parses it via yaml.parse and treats the remainder as body. Every fallback
 * degrades gracefully to a rendered `content` slide — NEVER throws, never drops a
 * slide (project-context.md Error handling):
 *  - no fence -> type: content, whole chunk = body
 *  - malformed yaml (parse throws) -> type: content, raw fence text folded into body
 *  - missing/unrecognized type -> content
 *  - columns not exactly 2 -> pad/truncate to 2
 */
export function extractSlideConfig(chunk: SlideChunk): SlideConfig {
  const m = YAML_FENCE_RE.exec(chunk.raw)

  if (!m) {
    return { type: 'content', body: chunk.raw }
  }

  const fenceText = m[1]
  const body = chunk.raw.slice(m[0].length).trim()

  let parsed: unknown
  try {
    parsed = parseYaml(fenceText)
  } catch {
    // Malformed yaml: fall back to content, fold the raw fence text (visible, not
    // silently dropped) plus the rest of the chunk into body.
    const fallbackBody = ['```yaml', fenceText, '```', body].filter(Boolean).join('\n\n')
    return { type: 'content', body: fallbackBody, rawFenceFallback: fenceText }
  }

  if (!isPlainObject(parsed)) {
    // e.g. yaml fence held a scalar/array, not a mapping — treat as no usable config.
    return { type: 'content', body }
  }

  const type: SlideType = isSlideType(parsed.type) ? parsed.type : 'content'

  const config: SlideConfig = { type, body }

  if (typeof parsed.title === 'string') config.title = parsed.title
  if (typeof parsed.subtitle === 'string') config.subtitle = parsed.subtitle
  if (typeof parsed.author === 'string') config.author = parsed.author
  if (typeof parsed.date === 'string') config.date = parsed.date
  if (typeof parsed.image === 'string') config.image = parsed.image
  if (typeof parsed.caption === 'string') config.caption = parsed.caption
  if (typeof parsed.notes === 'string') config.notes = parsed.notes

  if (type === 'two-column' || parsed.columns !== undefined) {
    config.columns = padColumns(parsed.columns)
  }

  const footer = validateSlideFooter(parsed.footer)
  if (Object.keys(footer).length) config.footer = footer

  const style = validateSlideStyle(parsed.style)
  if (Object.keys(style).length) config.style = style

  return config
}

export interface DeckConfig {
  style?: SlideStyle
  footer?: SlideFooter
}

/**
 * Peeks at a chunk's yaml fence (if any) to determine whether it declares
 * `type: deck` — a document-level config block, not a rendered slide. Returns
 * false for chunks with no yaml fence, malformed yaml, a non-mapping fence, or
 * any other type (including missing/unrecognized, which extractSlideConfig
 * separately falls back to `content` for — this function is only about
 * distinguishing the deck-config chunk from every rendered slide chunk).
 */
export function isDeckChunk(chunk: SlideChunk): boolean {
  const m = YAML_FENCE_RE.exec(chunk.raw)
  if (!m) return false
  let parsed: unknown
  try {
    parsed = parseYaml(m[1])
  } catch {
    return false
  }
  return isPlainObject(parsed) && parsed.type === 'deck'
}

/**
 * Extracts deck-level config from a `type: deck` chunk. Only `style`/`footer`
 * are recognized — everything else (a stray title, body text, etc.) is
 * ignored, same forward-compatible-fallback philosophy as slide config. Same
 * guardrail validation as per-slide style/footer (validateSlideStyle /
 * validateSlideFooter). Malformed yaml, a non-mapping fence, or no fence at
 * all yields {} — the deck falls back to built-in defaults, never throws.
 */
export function extractDeckConfig(chunk: SlideChunk): DeckConfig {
  const m = YAML_FENCE_RE.exec(chunk.raw)
  if (!m) return {}
  let parsed: unknown
  try {
    parsed = parseYaml(m[1])
  } catch {
    return {}
  }
  if (!isPlainObject(parsed)) return {}

  const config: DeckConfig = {}
  const style = validateSlideStyle(parsed.style)
  if (Object.keys(style).length) config.style = style
  const footer = validateSlideFooter(parsed.footer)
  if (Object.keys(footer).length) config.footer = footer
  return config
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── Registry ─────────────────────────────────────────────────────────────
// Closed for modification, open for extension: a new slide type is a new entry
// here only — split/extract logic never changes per type. Exhaustive Record so
// the compiler enforces every SlideType has an entry (coding-standards.md).
//
// NOTE: real layout components are implemented in components/slideLayouts/*.tsx
// (T8) and wired into this registry as the final step of T7 wiring, once those
// components exist. Importing them here (rather than duplicating stubs) keeps
// SLIDE_LAYOUTS as the single source of truth for the type -> component mapping.
import TitleLayout from '../components/slideLayouts/TitleLayout'
import SectionLayout from '../components/slideLayouts/SectionLayout'
import ContentLayout from '../components/slideLayouts/ContentLayout'
import TwoColumnLayout from '../components/slideLayouts/TwoColumnLayout'
import ImageFocusLayout from '../components/slideLayouts/ImageFocusLayout'

export const SLIDE_LAYOUTS: Record<SlideType, SlideLayout> = {
  title: TitleLayout,
  section: SectionLayout,
  content: ContentLayout,
  'two-column': TwoColumnLayout,
  'image-focus': ImageFocusLayout,
}
