// Worker-safe markup reading.
//
// DOMParser is a Window interface — it does not exist in a Web Worker, and
// parsing a book on the main thread would freeze the UI for seconds. So this is
// a small hand-rolled tokenizer instead of a DOM.
//
// It does not need to be a general HTML parser. The job is narrow: recover the
// ordered block-level text of a chapter, and read attributes out of the small,
// well-formed XML files an EPUB uses for its manifest and navigation. Markup is
// never re-emitted — text is extracted and re-escaped on the way out — so there
// is no injection surface to sanitise.

/**
 * Elements whose text is never spoken.
 *
 * Beyond the obvious non-content ones, `rt`/`rp`/`rtc` carry ruby annotations —
 * pronunciation glosses printed above the base text. Reading them speaks every
 * annotated word twice.
 */
export const SKIPPED_ELEMENTS = new Set([
  'script', 'style', 'head', 'title', 'svg', 'math',
  'template', 'noscript', 'textarea', 'select', 'datalist', 'iframe',
  'rt', 'rp', 'rtc',
])

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', deg: '°',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/** Decode entities and collapse whitespace — text as it will be spoken. */
export function normalizeText(raw: string): string {
  return decodeEntities(raw).replace(/\s+/g, ' ').trim()
}

/** Read one attribute out of a raw attribute string. */
export function getAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const match = re.exec(attrs)
  if (!match) return undefined
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
}

export interface Token {
  kind: 'open' | 'close' | 'text'
  /** Lowercased, namespace prefix stripped ('dc:title' -> 'title'). */
  name: string
  /** Original name including any prefix, lowercased. */
  qualifiedName: string
  attrs: string
  /** Raw text, for text tokens only. */
  text: string
  selfClosing: boolean
  /** Offset just past this token — where an element's inner content begins. */
  contentStart: number
  /** Offset of this token's `<`. */
  tagStart: number
}

/**
 * Split markup into open/close/text tokens with source offsets.
 * Comments, CDATA wrappers, doctypes and processing instructions are handled.
 */
export function* tokenize(source: string): Generator<Token> {
  const lower = source.toLowerCase()
  let i = 0

  const textToken = (text: string, at: number): Token => ({
    kind: 'text', name: '', qualifiedName: '', attrs: '', text,
    selfClosing: false, contentStart: at, tagStart: at,
  })

  while (i < source.length) {
    const lt = source.indexOf('<', i)

    if (lt === -1) {
      if (i < source.length) yield textToken(source.slice(i), i)
      return
    }
    if (lt > i) yield textToken(source.slice(i, lt), i)

    if (lower.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt)
      i = end === -1 ? source.length : end + 3
      continue
    }
    if (lower.startsWith('<![cdata[', lt)) {
      const end = source.indexOf(']]>', lt)
      yield textToken(source.slice(lt + 9, end === -1 ? source.length : end), lt)
      i = end === -1 ? source.length : end + 3
      continue
    }
    if (source[lt + 1] === '!' || source[lt + 1] === '?') {
      const end = source.indexOf('>', lt)
      i = end === -1 ? source.length : end + 1
      continue
    }

    const gt = source.indexOf('>', lt)
    if (gt === -1) return

    const rawTag = source.slice(lt + 1, gt)
    const isClose = rawTag[0] === '/'
    const body = isClose ? rawTag.slice(1) : rawTag
    const nameEnd = body.search(/[\s/]/)
    const qualifiedName = (nameEnd === -1 ? body : body.slice(0, nameEnd)).toLowerCase().trim()

    if (!qualifiedName) {
      i = gt + 1
      continue
    }

    const colon = qualifiedName.indexOf(':')
    yield {
      kind: isClose ? 'close' : 'open',
      name: colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1),
      qualifiedName,
      attrs: nameEnd === -1 ? '' : body.slice(nameEnd),
      text: '',
      selfClosing: rawTag.trimEnd().endsWith('/') || VOID_ELEMENTS.has(qualifiedName),
      contentStart: gt + 1,
      tagStart: lt,
    }

    i = gt + 1
  }
}

/**
 * Elements that cannot hold a block-level element. A block start inside one is
 * proof the element was never closed.
 */
const INLINE_ELEMENTS = new Set([
  'a', 'span', 'em', 'strong', 'i', 'b', 'u', 's', 'small', 'sub', 'sup',
  'abbr', 'cite', 'code', 'q', 'mark', 'time', 'label', 'dfn', 'kbd', 'samp',
  'var', 'bdi', 'bdo', 'del', 'ins', 'ruby', 'rt', 'rp', 'rtc', 'svg', 'math',
  'title',
])

const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

export interface SkipTracker {
  /**
   * Feed every token, in order. True when the token falls inside a subtree that
   * is being skipped and the caller should ignore it.
   */
  skip(token: Token): boolean
  /** Skip the subtree of the open token that was just fed. */
  enter(token: Token): void
}

/**
 * Tracks which tokens belong to an element whose subtree is not being read.
 *
 * Real books ship unclosed tags, and a skip that can only end on its own close
 * tag discards everything after one — the rest of the chapter, and with it the
 * rest of the book. So the skip is bounded two ways: it ends at the close tag
 * of an element that was already open when it started, since an ancestor
 * cannot close before its child; and a skipped inline element ends at the first
 * block-level tag, which it could never have contained. Malformed markup costs
 * one element, not the remainder.
 */
export function createSkipTracker(): SkipTracker {
  /** Names of the elements currently open, outermost first. */
  const open: string[] = []
  let skipAt = -1
  let skipInline = false

  return {
    skip(token: Token): boolean {
      if (token.kind === 'text') return skipAt >= 0

      if (token.kind === 'open') {
        if (skipAt >= 0 && skipInline && BLOCK_ELEMENTS.has(token.name)) {
          open.length = skipAt
          skipAt = -1
        }
        if (!token.selfClosing) open.push(token.name)
        return skipAt >= 0
      }

      let at = -1
      for (let i = open.length - 1; i >= 0; i--) {
        if (open[i] === token.name) {
          at = i
          break
        }
      }
      // A close tag matching nothing is stray: it closes nothing and ends nothing.
      if (at === -1) return skipAt >= 0

      open.length = at
      if (skipAt < 0 || at > skipAt) return skipAt >= 0

      // At the skipped element this close is its own; above it, the skipped
      // element was never closed and the caller still needs this tag.
      const own = at === skipAt
      skipAt = -1
      return own
    },

    enter(token: Token): void {
      skipAt = open.length - 1
      skipInline = INLINE_ELEMENTS.has(token.name)
    },
  }
}

export interface ElementMatch {
  name: string
  attrs: string
  /** Raw inner markup. Empty for self-closing and void elements. */
  inner: string
}

/**
 * Every occurrence of the named elements, with their inner markup.
 *
 * Matched on the local name, so `dc:title` is found by asking for `title`.
 * Nesting-aware via a stack: a `seq` inside a `seq` closes the correct one.
 */
export function findElements(source: string, names: string[]): ElementMatch[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()))
  const out: ElementMatch[] = []
  const open: { name: string; attrs: string; contentStart: number; index: number }[] = []

  for (const token of tokenize(source)) {
    if (token.kind === 'open' && wanted.has(token.name)) {
      if (token.selfClosing) {
        out.push({ name: token.name, attrs: token.attrs, inner: '' })
      } else {
        // Reserve the slot now so results stay in document order even when
        // elements nest — the outer element opened first, so it lists first.
        out.push({ name: token.name, attrs: token.attrs, inner: '' })
        open.push({
          name: token.name,
          attrs: token.attrs,
          contentStart: token.contentStart,
          index: out.length - 1,
        })
      }
      continue
    }

    if (token.kind === 'close' && wanted.has(token.name)) {
      for (let i = open.length - 1; i >= 0; i--) {
        if (open[i].name === token.name) {
          out[open[i].index].inner = source.slice(open[i].contentStart, token.tagStart)
          open.splice(i, 1)
          break
        }
      }
    }
  }

  return out
}

/**
 * Only the outermost occurrences of the named elements.
 *
 * Reading a nested table of contents needs the direct children of a list, not
 * every descendant — `findElements` returns both, which flattens the very
 * structure being recovered.
 */
export function findChildElements(source: string, names: string[]): ElementMatch[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()))
  const out: ElementMatch[] = []

  let open: { name: string; attrs: string; contentStart: number } | null = null
  let depth = 0

  for (const token of tokenize(source)) {
    if (token.kind === 'open' && wanted.has(token.name)) {
      if (token.selfClosing) {
        if (!open) out.push({ name: token.name, attrs: token.attrs, inner: '' })
        continue
      }
      if (open) depth++
      else open = { name: token.name, attrs: token.attrs, contentStart: token.contentStart }
      continue
    }

    if (token.kind === 'close' && wanted.has(token.name) && open) {
      if (depth > 0) {
        depth--
        continue
      }
      out.push({
        name: open.name,
        attrs: open.attrs,
        inner: source.slice(open.contentStart, token.tagStart),
      })
      open = null
    }
  }

  return out
}

/** First matching element, or undefined. */
export function findElement(source: string, name: string): ElementMatch | undefined {
  return findElements(source, [name])[0]
}

/** All text content of a markup fragment, with skipped elements removed. */
export function textContent(source: string): string {
  const skipped = createSkipTracker()
  let out = ''

  for (const token of tokenize(source)) {
    if (skipped.skip(token)) continue

    if (token.kind === 'open' && SKIPPED_ELEMENTS.has(token.name) && !token.selfClosing) {
      skipped.enter(token)
      continue
    }
    if (token.kind === 'text') out += token.text
  }

  return normalizeText(out)
}
