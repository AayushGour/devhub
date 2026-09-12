// Chapter markup -> ordered blocks of spoken text.
//
// Text is attributed to the INNERMOST enclosing block element, so
// `<blockquote><p>…</p></blockquote>` yields one paragraph rather than the same
// words twice. A block element holding text directly emits that text itself.

import { SKIPPED_ELEMENTS, normalizeText, tokenize } from './markup'
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

interface Frame {
  type: Block['type']
  tag: string
  text: string
  /** Set when a nested block emitted — suppresses this frame's own output. */
  childEmitted: boolean
}

export function extractBlocks(markup: string): Block[] {
  const blocks: Block[] = []
  const stack: Frame[] = []

  let skipDepth = 0
  let skipName = ''

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
    if (skipDepth > 0) {
      if (token.kind === 'open' && token.name === skipName && !token.selfClosing) skipDepth++
      else if (token.kind === 'close' && token.name === skipName) skipDepth--
      continue
    }

    if (token.kind === 'open' && SKIPPED_ELEMENTS.has(token.name) && !token.selfClosing) {
      skipDepth = 1
      skipName = token.name
      continue
    }

    if (token.kind === 'text') {
      const frame = stack[stack.length - 1]
      if (frame) frame.text += token.text
      continue
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
