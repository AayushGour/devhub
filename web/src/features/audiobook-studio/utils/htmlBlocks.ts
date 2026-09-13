// Chapter markup -> ordered blocks of spoken text.
//
// Text is attributed to the INNERMOST enclosing block element, so
// `<blockquote><p>…</p></blockquote>` yields one paragraph rather than the same
// words twice. A block element holding text directly emits that text itself.

import { SKIPPED_ELEMENTS, createSkipTracker, getAttr, normalizeText, tokenize } from './markup'
import type { Block } from './sentences'

const BLOCK_TYPES: Record<string, Block['type']> = {
  h1: 'h1', h2: 'h2', h3: 'h3',
  h4: 'h3', h5: 'h3', h6: 'h3',
  p: 'p', div: 'p', section: 'p', article: 'p',
  blockquote: 'quote',
  li: 'list', dd: 'list', dt: 'list',
  td: 'p', th: 'p', caption: 'p', figcaption: 'p',
}

/**
 * Containers that should not emit their own text when they hold real blocks.
 * They still emit when they directly contain prose, which is common in EPUBs
 * that use `<div>` where they mean `<p>`.
 */
const CONTAINERS = new Set(['div', 'section', 'article', 'blockquote'])

/**
 * Elements HTML closes implicitly. A `<p>` is ended by any block-level start
 * tag, and a list item by the next one. Without this, malformed-but-common
 * markup like `<p>a<p>b` nests instead of sequencing, and blocks come out in
 * close order rather than document order.
 */
function impliesClose(openTag: string, incoming: string): boolean {
  if (openTag === 'p') return true
  if (openTag === 'li') return incoming === 'li'
  if (openTag === 'dd' || openTag === 'dt') return incoming === 'dd' || incoming === 'dt'
  return false
}

/**
 * `epub:type` values whose text is not prose to be read.
 *
 * A page break carries the page number — often in a `title` attribute with no
 * text at all, but sometimes as content, where it interrupts a sentence with a
 * bare number. A note reference is the superscript marker, not the note.
 *
 * EPUB 3 names footnote, endnote and pagebreak as the structures reading
 * systems are "most likely to offer the option" of skipping.
 * https://www.w3.org/TR/epub-33/#sec-skippability
 */
const UNSPOKEN_TYPES = ['pagebreak', 'noteref', 'footnote', 'endnote', 'rearnote']

/**
 * Whether an element's whole subtree is outside the reading order.
 *
 * Hidden content is excluded from the accessibility tree, and a narrator is an
 * assistive presentation — reading what a screen reader would not is wrong for
 * the same reasons.
 * https://www.w3.org/TR/wai-aria-1.2/#tree_exclusion
 */
function isUnspoken(name: string, attrs: string): boolean {
  if (SKIPPED_ELEMENTS.has(name)) return true
  if (getAttr(attrs, 'aria-hidden') === 'true') return true
  if (/(^|\s)hidden(\s|=|$)/i.test(attrs)) return true

  const type = getAttr(attrs, 'epub:type')?.toLowerCase() ?? ''
  if (type && UNSPOKEN_TYPES.some((value) => type.split(/\s+/).includes(value))) return true

  const role = getAttr(attrs, 'role')?.toLowerCase() ?? ''
  return role.startsWith('doc-') && UNSPOKEN_TYPES.includes(role.slice(4))
}

interface Frame {
  type: Block['type']
  tag: string
  text: string
  /** Set when a nested block emitted — suppresses this frame's own output. */
  childEmitted: boolean
}

export interface BlocksWithAnchors {
  blocks: Block[]
  /** Anchor id -> index of the first block at or after it. */
  anchorAt: Map<string, number>
}

/**
 * Extract blocks, recording where the given anchors fall among them.
 *
 * A single content document often holds several chapters, each targeted by its
 * own fragment in the table of contents. Knowing which block each anchor lands
 * on is what allows that document to be cut into real chapters.
 */
export function extractBlocksWithAnchors(
  markup: string,
  anchors: Set<string>,
): BlocksWithAnchors {
  const anchorAt = new Map<string, number>()
  const blocks = extractBlocks(markup, (id, index) => {
    // The first mention wins: an id repeated later is not a new chapter start.
    if (anchors.has(id) && !anchorAt.has(id)) anchorAt.set(id, index)
  })
  return { blocks, anchorAt }
}

export function extractBlocks(
  markup: string,
  onAnchor?: (id: string, blockIndex: number) => void,
): Block[] {
  const blocks: Block[] = []
  const stack: Frame[] = []

  const skipped = createSkipTracker()

  const emit = (frame: Frame) => {
    const text = normalizeText(frame.text)
    if (!text) return
    // A container that already produced child blocks would otherwise repeat
    // their words as one run-on paragraph.
    if (frame.childEmitted && CONTAINERS.has(frame.tag)) return

    blocks.push({ type: frame.type, text })
    for (const parent of stack) parent.childEmitted = true
  }

  for (const token of tokenize(markup)) {
    if (skipped.skip(token)) continue

    if (token.kind === 'open' && isUnspoken(token.name, token.attrs)) {
      // A self-closing marker has no subtree to skip — the common shape for a
      // page break, whose number lives in an attribute.
      if (token.selfClosing) continue
      skipped.enter(token)
      continue
    }

    if (token.kind === 'text') {
      const frame = stack[stack.length - 1]
      if (frame) frame.text += token.text
      continue
    }

    if (token.kind === 'open') {
      // Reported before the element's own blocks exist, so the anchor points at
      // the first block inside it — which is what a chapter start means.
      const id = onAnchor ? getAttr(token.attrs, 'id') : undefined
      if (id) onAnchor!(id, blocks.length)
    }

    if (token.kind === 'open' && !token.selfClosing) {
      const type = BLOCK_TYPES[token.name]
      if (type) {
        while (stack.length > 0 && impliesClose(stack[stack.length - 1].tag, token.name)) {
          emit(stack.pop()!)
        }
        stack.push({ type, tag: token.name, text: '', childEmitted: false })
      }
      // `<br/>` is void, so it arrives self-closing; treat it as a space.
      continue
    }

    if (token.kind === 'open' && token.selfClosing && token.name === 'br') {
      const frame = stack[stack.length - 1]
      if (frame) frame.text += ' '
      continue
    }

    if (token.kind === 'close' && BLOCK_TYPES[token.name]) {
      // Unclosed inner tags are common; unwind to the matching frame.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === token.name) {
          while (stack.length > i + 1) emit(stack.pop()!)
          emit(stack.pop()!)
          break
        }
      }
    }
  }

  while (stack.length > 0) emit(stack.pop()!)

  return blocks
}
