// Skipping a subtree that is never closed.
//
// An unclosed tag is ordinary in shipped EPUBs, and a skip that can only end on
// its own close tag takes the rest of the document with it — silently, since
// the missing text looks exactly like a chapter that ended early.

import { describe, it, expect } from 'vitest'
import { extractBlocks } from './htmlBlocks'
import { textContent } from './markup'

describe('extractBlocks skipping', () => {
  it('still drops the subtree of a well-formed skip', () => {
    const html =
      '<p>Before.<span epub:type="pagebreak">12</span> After.</p>' +
      '<div aria-hidden="true"><p>Not spoken.</p></div>' +
      '<p>Last.</p>'

    expect(extractBlocks(html)).toEqual([
      { type: 'p', text: 'Before. After.' },
      { type: 'p', text: 'Last.' },
    ])
  })

  it('ends an unclosed skip at the close tag of an element already open', () => {
    const html = '<body><p>Before.<span epub:type="pagebreak">12</p><p>After.</p></body>'

    expect(extractBlocks(html)).toEqual([
      { type: 'p', text: 'Before.' },
      { type: 'p', text: 'After.' },
    ])
  })

  it('ends an unclosed inline skip at the next block, with no ancestor to help', () => {
    const html = '<p>Before.<a epub:type="noteref" href="#n1">1<p>After.</p>'

    expect(extractBlocks(html)).toEqual([
      { type: 'p', text: 'Before.' },
      { type: 'p', text: 'After.' },
    ])
  })

  it('keeps the rest of the chapter when a script is never closed', () => {
    const html = '<div><script>reader.init()</div><p>After.</p>'
    expect(extractBlocks(html)).toEqual([{ type: 'p', text: 'After.' }])
  })

  it('does not let a nested same-name element end the skip early', () => {
    const html = '<div aria-hidden="true"><div>Hidden.</div>Still hidden.</div><p>After.</p>'
    expect(extractBlocks(html)).toEqual([{ type: 'p', text: 'After.' }])
  })
})

describe('textContent skipping', () => {
  it('drops script and style content', () => {
    const html = '<div>keep<script>var x = 1</script><style>.a{}</style> this</div>'
    expect(textContent(html)).toBe('keep this')
  })

  it('recovers the text after an unclosed skipped element', () => {
    const html = '<span>keep<svg><path d="M0 0"/>lost</span> and this'
    expect(textContent(html)).toBe('keep and this')
  })
})
