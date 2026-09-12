import { describe, it, expect } from 'vitest'
import { decodeEntities, findElement, findElements, getAttr, textContent } from './markup'
import { extractBlocks } from './htmlBlocks'

describe('getAttr', () => {
  it('reads quoted, single-quoted and bare values', () => {
    expect(getAttr(' href="a.xhtml" id=\'x\' n=3', 'href')).toBe('a.xhtml')
    expect(getAttr(' href="a.xhtml" id=\'x\' n=3', 'id')).toBe('x')
    expect(getAttr(' href="a.xhtml" id=\'x\' n=3', 'n')).toBe('3')
  })

  it('does not match an attribute that is a suffix of another', () => {
    expect(getAttr(' data-href="no" href="yes"', 'href')).toBe('yes')
  })

  it('decodes entities in values', () => {
    expect(getAttr(' title="Tom &amp; Jerry"', 'title')).toBe('Tom & Jerry')
  })
})

describe('decodeEntities', () => {
  it('handles named, decimal and hex references', () => {
    expect(decodeEntities('a &amp; b &#233; c &#x2014; d')).toBe('a & b é c — d')
  })

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notareal;')).toBe('&notareal;')
  })
})

describe('findElements', () => {
  it('matches on local name, ignoring the namespace prefix', () => {
    const xml = '<package><dc:title>Salt Roads</dc:title></package>'
    expect(findElement(xml, 'title')?.inner).toBe('Salt Roads')
  })

  it('handles self-closing elements', () => {
    const xml = '<manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest>'
    const items = findElements(xml, ['item'])
    expect(items).toHaveLength(2)
    expect(getAttr(items[1].attrs, 'id')).toBe('b')
  })

  it('closes the correct element when the same name nests', () => {
    const xml = '<seq id="outer"><seq id="inner">x</seq>y</seq>'
    const found = findElements(xml, ['seq'])
    expect(found).toHaveLength(2)
    expect(getAttr(found[0].attrs, 'id')).toBe('outer')
    expect(found[0].inner).toBe('<seq id="inner">x</seq>y')
    expect(found[1].inner).toBe('x')
  })

  it('skips comments, doctypes and CDATA wrappers', () => {
    const xml = '<!DOCTYPE html><!-- <title>fake</title> --><t><![CDATA[real]]></t>'
    expect(findElement(xml, 't')?.inner).toBe('<![CDATA[real]]>')
    expect(findElement(xml, 'title')).toBeUndefined()
  })
})

describe('textContent', () => {
  it('drops script and style content', () => {
    const html = '<div>keep<script>var x = 1</script><style>.a{}</style> this</div>'
    expect(textContent(html)).toBe('keep this')
  })
})

describe('extractBlocks', () => {
  it('attributes text to the innermost block, not its container', () => {
    const html = '<blockquote><p>Inner words.</p></blockquote>'
    expect(extractBlocks(html)).toEqual([{ type: 'p', text: 'Inner words.' }])
  })

  it('emits a container that holds prose directly', () => {
    const html = '<div>Loose prose in a div.</div>'
    expect(extractBlocks(html)).toEqual([{ type: 'p', text: 'Loose prose in a div.' }])
  })

  it('keeps document order across heading levels and lists', () => {
    const html = `
      <h1>Chapter One</h1>
      <p>First paragraph <em>with</em> inline markup.</p>
      <ul><li>Alpha</li><li>Bravo</li></ul>
      <h2>A Section</h2>
    `
    expect(extractBlocks(html)).toEqual([
      { type: 'h1', text: 'Chapter One' },
      { type: 'p', text: 'First paragraph with inline markup.' },
      { type: 'list', text: 'Alpha' },
      { type: 'list', text: 'Bravo' },
      { type: 'h2', text: 'A Section' },
    ])
  })

  it('treats <br/> as a space rather than gluing words together', () => {
    expect(extractBlocks('<p>one<br/>two</p>')).toEqual([{ type: 'p', text: 'one two' }])
  })

  it('decodes entities and collapses whitespace', () => {
    const html = '<p>Tom  &amp;\n  Jerry&#8212;again</p>'
    expect(extractBlocks(html)).toEqual([{ type: 'p', text: 'Tom & Jerry—again' }])
  })

  it('recovers from unclosed inline tags', () => {
    const html = '<p>before <em>emphasis <p>after</p>'
    const blocks = extractBlocks(html)
    expect(blocks.map((b) => b.text)).toEqual(['before emphasis', 'after'])
  })

  it('ignores empty and whitespace-only blocks', () => {
    expect(extractBlocks('<p></p><p>   </p><p>real</p>')).toEqual([
      { type: 'p', text: 'real' },
    ])
  })
})
