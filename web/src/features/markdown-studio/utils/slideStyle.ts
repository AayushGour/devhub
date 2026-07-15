// Pure guardrail validators + mergers for per-slide `style`/`footer` yaml fields.
// No DOM access here — see slideOverflow.ts for the DOM-measuring counterpart.
//
// Defense-in-depth: slide yaml is LLM-generated, untrusted input (local-only, but
// still validated). Every value is allow-pattern checked before being placed into a
// React `style={{}}` object — React's attribute escaping is what actually forecloses
// injection; these checks are a second layer, not a substitute (see project-context.md
// Business rules / CLAUDE.md sanctioned inline-style exception).

export const FONT_SIZE_MIN_PX = 8
export const FONT_SIZE_MAX_PX = 120

export type SlideAlign = 'left' | 'center' | 'right'

export interface SlideFooter {
  show?: boolean
  left?: string
  center?: string
  right?: string
  pageNumber?: boolean
}

export interface SlideStyle {
  background?: { color?: string; image?: string }
  title?: { color?: string; fontSize?: string; align?: SlideAlign }
  body?: { color?: string; fontSize?: string }
}

// Field-level resolved footer for a single slide — always fully populated (D5: any
// field the slide omits inherits the deck-level ExportConfig value for that field).
export interface ResolvedFooter {
  show: boolean
  left: string
  center: string
  right: string
  pageNumber: boolean
}

// Deck-level footer defaults a slide's footer merges over. Shaped to match the
// relevant subset of ExportConfig (utils/pdfExport.ts) — see D5.
export interface DeckFooterDefaults {
  show: boolean
  left: string
  center: string
  right: string
  pageNumber: boolean
}

// Built-in deck-level footer defaults, used when a deck has no `type: deck` block (or
// that block's own footer omits a field). NOT sourced from continuous-mode's
// ExportConfig/defaultExportConfig — deck mode's footer defaults come from the
// document itself (the `type: deck` block, see slideParser.ts's extractDeckConfig),
// consistent with the rest of deck-mode config living in the document, not app state.
// pageNumber defaults to false (opt-in): page numbers used to always render via a
// separate always-on corner badge regardless of any footer setting — that badge is
// removed; a page number is now purely a footer feature, off unless a deck or slide
// explicitly turns it on via footer.pageNumber.
export const DEFAULT_DECK_FOOTER: DeckFooterDefaults = {
  show: true,
  left: '',
  center: '',
  right: '',
  pageNumber: false,
}

const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/
const FONT_SIZE_RE = /^\d+(\.\d+)?(px|em|rem|pt)$/
const ALIGN_VALUES: SlideAlign[] = ['left', 'center', 'right']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateColor(v: unknown): string | undefined {
  return typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : undefined
}

// Resolves a fontSize string to its px-equivalent for range clamping. Conversion
// basis fixed by D3: em/rem at 16px base, pt at ×(96/72).
function fontSizeToPx(value: string, unit: string): number {
  const n = parseFloat(value)
  switch (unit) {
    case 'px': return n
    case 'em':
    case 'rem': return n * 16
    case 'pt': return n * (96 / 72)
    default: return n
  }
}

function validateFontSize(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = FONT_SIZE_RE.exec(v.trim())
  if (!m) return undefined
  const px = fontSizeToPx(m[0], m[2])
  if (px < FONT_SIZE_MIN_PX || px > FONT_SIZE_MAX_PX) return undefined
  return v.trim()
}

function validateAlign(v: unknown): SlideAlign | undefined {
  return typeof v === 'string' && (ALIGN_VALUES as string[]).includes(v) ? (v as SlideAlign) : undefined
}

function validateImageUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined
}

/**
 * Validates a raw parsed `style` yaml value against the fixed 3-level schema
 * (background/title/body). Unknown categories/properties are ignored per-key;
 * a value failing its allow-pattern is dropped, the rest of `style` still applies.
 * Non-object input (including null/array) returns {} — whole field ignored.
 */
export function validateSlideStyle(raw: unknown): SlideStyle {
  if (!isPlainObject(raw)) return {}

  const out: SlideStyle = {}

  if (isPlainObject(raw.background)) {
    const bg: NonNullable<SlideStyle['background']> = {}
    const color = validateColor(raw.background.color)
    if (color) bg.color = color
    const image = validateImageUrl(raw.background.image)
    if (image) bg.image = image
    if (Object.keys(bg).length) out.background = bg
  }

  if (isPlainObject(raw.title)) {
    const title: NonNullable<SlideStyle['title']> = {}
    const color = validateColor(raw.title.color)
    if (color) title.color = color
    const fontSize = validateFontSize(raw.title.fontSize)
    if (fontSize) title.fontSize = fontSize
    const align = validateAlign(raw.title.align)
    if (align) title.align = align
    if (Object.keys(title).length) out.title = title
  }

  if (isPlainObject(raw.body)) {
    const body: NonNullable<SlideStyle['body']> = {}
    const color = validateColor(raw.body.color)
    if (color) body.color = color
    const fontSize = validateFontSize(raw.body.fontSize)
    if (fontSize) body.fontSize = fontSize
    if (Object.keys(body).length) out.body = body
  }

  return out
}

/**
 * Validates a raw parsed `footer` yaml value (2-level flat). Unknown keys ignored;
 * non-object input returns {} (whole field ignored, slide inherits deck defaults).
 */
export function validateSlideFooter(raw: unknown): SlideFooter {
  if (!isPlainObject(raw)) return {}
  const out: SlideFooter = {}
  if (typeof raw.show === 'boolean') out.show = raw.show
  if (typeof raw.left === 'string') out.left = raw.left
  if (typeof raw.center === 'string') out.center = raw.center
  if (typeof raw.right === 'string') out.right = raw.right
  if (typeof raw.pageNumber === 'boolean') out.pageNumber = raw.pageNumber
  return out
}

/**
 * Field-level merge (D5): each footer field is taken from the slide's footer if
 * present, else the deck-level default for that field individually.
 */
export function mergeFooter(slideFooter: SlideFooter | undefined, deckFooter: DeckFooterDefaults): ResolvedFooter {
  return {
    show: slideFooter?.show ?? deckFooter.show,
    left: slideFooter?.left ?? deckFooter.left,
    center: slideFooter?.center ?? deckFooter.center,
    right: slideFooter?.right ?? deckFooter.right,
    pageNumber: slideFooter?.pageNumber ?? deckFooter.pageNumber,
  }
}

/**
 * Field-level merge (mirrors mergeFooter): a slide's `style` merges over the deck's
 * default `style`, per category then per property — a slide overriding just
 * style.title.color keeps the deck's style.background.color and any other
 * style.title.* properties the deck set (e.g. fontSize). Categories present in only
 * one side pass through unchanged; a category absent from both sides is omitted from
 * the result entirely (not present as an empty object), matching validateSlideStyle's
 * own omit-if-empty convention.
 */
export function mergeSlideStyle(deckStyle: SlideStyle, slideStyle: SlideStyle | undefined): SlideStyle {
  const out: SlideStyle = {}

  const background = { ...deckStyle.background, ...slideStyle?.background }
  if (Object.keys(background).length) out.background = background

  const title = { ...deckStyle.title, ...slideStyle?.title }
  if (Object.keys(title).length) out.title = title

  const body = { ...deckStyle.body, ...slideStyle?.body }
  if (Object.keys(body).length) out.body = body

  return out
}

export interface SlideReactStyle {
  wrapper: React.CSSProperties
  title: React.CSSProperties
  body: React.CSSProperties
}

/**
 * Converts a validated SlideStyle into React.CSSProperties objects — never
 * string-concatenated CSS. This is the sanctioned inline-style exception
 * (CLAUDE.md): runtime-dynamic, data-driven values from parsed yaml.
 */
export function slideStyleToReactStyle(style: SlideStyle | undefined): SlideReactStyle {
  const wrapper: React.CSSProperties = {}
  const title: React.CSSProperties = {}
  const body: React.CSSProperties = {}

  if (style?.background?.color) wrapper.backgroundColor = style.background.color
  if (style?.background?.image) {
    // URL already validated http(s)-only by validateImageUrl; wrapped in a CSS url()
    // via a React style object (not string-concatenated CSS elsewhere).
    wrapper.backgroundImage = `url("${style.background.image}")`
    wrapper.backgroundSize = 'cover'
    wrapper.backgroundPosition = 'center'
  }

  if (style?.title?.color) title.color = style.title.color
  if (style?.title?.fontSize) title.fontSize = style.title.fontSize
  if (style?.title?.align) title.textAlign = style.title.align

  if (style?.body?.color) body.color = style.body.color
  if (style?.body?.fontSize) body.fontSize = style.body.fontSize

  return { wrapper, title, body }
}
