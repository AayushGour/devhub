import { describe, it, expect } from 'vitest'
import {
  decodeEntities,
  findChildElements,
  findElement,
  findElements,
  getAttr,
  textContent,
} from './markup'
import { titleFromHref } from './epubRead'
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

describe('nav documents with several navs', () => {
  // Real EPUBs put the table of contents, the landmarks and a page-list in one
  // file. Only the first is a list of chapters; the page-list links carry page
  // numbers and point at the very same documents.
  const nav = `<html><body>
    <nav epub:type="toc"><ol>
      <li><a href="text/06_Foreword.xhtml#for">Foreword</a></li>
      <li><a href="text/07_Chapter1.xhtml">1. Meeting Your Inner Child</a></li>
    </ol></nav>
    <nav epub:type="landmarks" hidden="hidden"><ol>
      <li><a href="text/00_Cover.xhtml" epub:type="cover">Cover</a></li>
    </ol></nav>
    <nav epub:type="page-list" hidden="hidden"><ol>
      <li><a href="text/06_Foreword.xhtml#p-ii">ii</a></li>
      <li><a href="text/07_Chapter1.xhtml#p-12">12</a></li>
    </ol></nav>
  </body></html>`

  it('finds the toc nav and not the page-list', () => {
    const navs = findElements(nav, ['nav'])
    expect(navs).toHaveLength(3)

    const toc = navs.find((n) => getAttr(n.attrs, 'epub:type')?.includes('toc'))
    expect(toc).toBeDefined()

    const labels = findElements(toc!.inner, ['a']).map((a) => textContent(a.inner))
    expect(labels).toEqual(['Foreword', '1. Meeting Your Inner Child'])
    // The page numbers must not be in scope at all.
    expect(labels).not.toContain('ii')
    expect(labels).not.toContain('12')
  })

  it('does not confuse page-list with toc when matching epub:type', () => {
    const navs = findElements(nav, ['nav'])
    const types = navs.map((n) => getAttr(n.attrs, 'epub:type'))
    expect(types).toEqual(['toc', 'landmarks', 'page-list'])
  })
})

describe('titleFromHref', () => {
  // Front and back matter is often absent from the table of contents and has
  // no heading, so the filename is all there is to go on.
  it('turns a spine filename into something readable', () => {
    expect(titleFromHref('text/01_Epigraph.xhtml')).toBe('Epigraph')
    expect(titleFromHref('text/29_Backmatter01.xhtml')).toBe('Backmatter')
    expect(titleFromHref('OEBPS/part-one_introduction.html')).toBe('Part One Introduction')
    expect(titleFromHref('chapterOne.xhtml')).toBe('Chapter One')
  })

  it('gives nothing back when the name carries no words', () => {
    expect(titleFromHref('text/0001.xhtml')).toBe('')
  })
})

describe('findChildElements', () => {
  const list = `<ol>
    <li><a href="a.xhtml">Section 1</a>
      <ol><li><a href="b.xhtml">Chapter 1</a></li>
          <li><a href="c.xhtml">Chapter 2</a></li></ol>
    </li>
    <li><a href="d.xhtml">Section 2</a></li>
  </ol>`

  it('returns only the outermost matches, not every descendant', () => {
    const outer = findElement(list, 'ol')!
    const items = findChildElements(outer.inner, ['li'])
    // Two sections, not two sections plus two nested chapters.
    expect(items).toHaveLength(2)
    expect(items.map((i) => textContent(findElement(i.inner, 'a')!.inner)))
      .toEqual(['Section 1', 'Section 2'])
  })

  it('keeps the nested list available inside its parent', () => {
    const outer = findElement(list, 'ol')!
    const first = findChildElements(outer.inner, ['li'])[0]
    const nested = findElement(first.inner, 'ol')!
    expect(findChildElements(nested.inner, ['li'])).toHaveLength(2)
  })
})
