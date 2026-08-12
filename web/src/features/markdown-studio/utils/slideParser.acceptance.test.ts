// Tester-authored AC-driven acceptance/regression suite for Slide Deck Export (T11).
// Maps directly to project-context.md "## User stories" AC bullets + "## Business rules".
// Complements (does not duplicate) the dev-authored slideParser.test.ts.
import { describe, it, expect } from 'vitest'
import { splitSlides, extractSlideConfig, SLIDE_LAYOUTS } from './slideParser'
import type { SlideType } from './slideParser'

describe('AC: fence-aware --- splitting (business rule: "Fence-aware --- splitting")', () => {
  it('a --- line inside a plain ``` code fence (non-mermaid) does not split', () => {
    const raw = [
      'type: content',
      '```',
      'some code',
      '---',
      'more code',
      '```',
      '---',
      'slide two',
    ].join('\n')
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].raw).toContain('some code')
    expect(chunks[0].raw).toContain('---')
    expect(chunks[1].raw).toBe('slide two')
  })

  it('multiple fenced blocks each containing their own --- do not fracture the deck', () => {
    const raw = [
      '```yaml',
      'type: content',
      '```',
      '```mermaid',
      'graph TD',
      'A-->B',
      '---',
      'C-->D',
      '```',
      'some body text',
      '```',
      'code fence 2',
      '---',
      '```',
      '---',
      'final slide',
    ].join('\n')
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
    expect(chunks[1].raw).toBe('final slide')
  })

  it('a genuine slide separator immediately after a closing fence still splits', () => {
    const raw = ['```', 'code', '```', '---', 'next'].join('\n')
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
    expect(chunks[1].raw).toBe('next')
  })

  it('an unclosed fence at EOF does not cause a crash and does not un-balance later parsing', () => {
    const raw = ['```', 'unterminated code', '---', 'still inside fence per scan'].join('\n')
    expect(() => splitSlides(raw)).not.toThrow()
    // Because the fence never closes, the whole thing is one chunk (in-fence --- ignored).
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(1)
  })
})

describe('AC: every extractSlideConfig fallback degrades gracefully, never throws, never drops a slide', () => {
  it('no yaml fence -> type content, body = whole chunk', () => {
    const config = extractSlideConfig({ raw: '# Just a heading\n\nSome body text.' })
    expect(config.type).toBe('content')
    expect(config.body).toBe('# Just a heading\n\nSome body text.')
  })

  it('unknown/unrecognized type -> falls back to content (not dropped, not throw)', () => {
    const raw = ['```yaml', 'type: carousel', 'title: "Future Type"', '```', 'body'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.title).toBe('Future Type')
    expect(config.body).toBe('body')
  })

  it('malformed yaml (parse throws) -> content, raw fence text folded into body, visible not dropped', () => {
    const raw = ['```yaml', 'type: [content', 'unterminated: "quote', '```', 'trailing text'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.rawFenceFallback).toBeTruthy()
    // Raw fence text must be visible in body, not silently dropped.
    expect(config.body).toContain('unterminated')
    expect(config.body).toContain('trailing text')
  })

  it('columns not exactly 2 on two-column: 0 columns -> padded to ["",""]', () => {
    const raw = ['```yaml', 'type: two-column', 'title: "Empty cols"', '```'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.columns).toEqual(['', ''])
  })

  it('columns not exactly 2 on two-column: 1 column -> padded, missing renders empty not throw', () => {
    const raw = ['```yaml', 'type: two-column', 'columns:', '  - "left only"', '```'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.columns).toEqual(['left only', ''])
  })

  it('columns not exactly 2 on two-column: 5 columns -> truncated to first 2', () => {
    const raw = ['```yaml', 'type: two-column', 'columns:', '  - "a"', '  - "b"', '  - "c"', '  - "d"', '  - "e"', '```'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.columns).toEqual(['a', 'b'])
  })

  it('columns entries that are non-string are filtered, not throw', () => {
    const raw = ['```yaml', 'type: two-column', 'columns:', '  - "a"', '  - 42', '  - null', '```'].join('\n')
    expect(() => extractSlideConfig({ raw })).not.toThrow()
    const config = extractSlideConfig({ raw })
    expect(config.columns).toEqual(['a', ''])
  })

  it('yaml fence holding a scalar (not a mapping) -> content, no throw, no crash on property access', () => {
    const raw = ['```yaml', '"just a string scalar"', '```', 'body text'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.body).toBe('body text')
  })

  it('yaml fence holding an array (not a mapping) -> content, no throw', () => {
    const raw = ['```yaml', '- one', '- two', '```', 'body text'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
  })

  it('every slide type registry entry is reachable and none throws across the whole fallback matrix', () => {
    const rawSamples = [
      'no fence, plain markdown',
      ['```yaml', 'type: title', 'title: "T"', '```'].join('\n'),
      ['```yaml', 'type: section', 'title: "S"', '```'].join('\n'),
      ['```yaml', 'type: content', 'title: "C"', '```', 'body'].join('\n'),
      ['```yaml', 'type: two-column', 'columns: ["a","b"]', '```'].join('\n'),
      ['```yaml', 'type: image-focus', 'image: "https://x.com/a.png"', '```'].join('\n'),
      ['```yaml', 'type: bogus', '```'].join('\n'),
      ['```yaml', '[[unparseable', '```'].join('\n'),
      '',
    ]
    for (const raw of rawSamples) {
      expect(() => extractSlideConfig({ raw })).not.toThrow()
      const config = extractSlideConfig({ raw })
      expect(SLIDE_LAYOUTS[config.type]).toBeTruthy()
    }
  })
})

describe('AC: no separate deck-level frontmatter — first slide carries deck title via yaml', () => {
  it('deck title/subtitle/author/date live on the first (type: title) slide config, not a separate concept', () => {
    const raw = [
      '---',
      '```yaml',
      'type: title',
      'title: "Deck Title"',
      'subtitle: "Sub"',
      'author: "Author"',
      'date: "2026-07-14"',
      '```',
      '---',
      '```yaml',
      'type: content',
      '```',
      'second slide body',
    ].join('\n')
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
    const first = extractSlideConfig(chunks[0])
    expect(first.type).toBe('title')
    expect(first.title).toBe('Deck Title')
    expect(first.subtitle).toBe('Sub')
    expect(first.author).toBe('Author')
    expect(first.date).toBe('2026-07-14')
  })
})

describe('AC: slide type registry is closed for modification, open for extension', () => {
  it('SLIDE_LAYOUTS is an exhaustive Record over every SlideType with no extra/missing keys', () => {
    const types: SlideType[] = ['title', 'section', 'content', 'two-column', 'image-focus']
    expect(Object.keys(SLIDE_LAYOUTS).sort()).toEqual([...types].sort())
  })
})
