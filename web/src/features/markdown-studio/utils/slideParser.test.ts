import { describe, it, expect } from 'vitest'
import { splitSlides, extractSlideConfig, SLIDE_LAYOUTS, isDeckChunk, extractDeckConfig } from './slideParser'

describe('splitSlides', () => {
  it('splits on standalone --- lines', () => {
    const raw = 'slide one\n---\nslide two\n---\nslide three'
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(3)
    expect(chunks[0].raw).toBe('slide one')
    expect(chunks[1].raw).toBe('slide two')
    expect(chunks[2].raw).toBe('slide three')
  })

  it('is fence-aware: a --- inside a ``` block does not split', () => {
    const raw = [
      'type: content',
      '```mermaid',
      'graph LR',
      '  A --> B',
      '---',
      '  B --> C',
      '```',
      '---',
      'next slide',
    ].join('\n')
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].raw).toContain('---')
    expect(chunks[0].raw).toContain('graph LR')
    expect(chunks[1].raw).toBe('next slide')
  })

  it('drops empty leading/trailing chunks', () => {
    const raw = '---\nslide one\n---\n'
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].raw).toBe('slide one')
  })

  it('handles a single chunk with no separators', () => {
    const chunks = splitSlides('just some content')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].raw).toBe('just some content')
  })

  it('tolerates trailing whitespace on the separator line', () => {
    const raw = 'a\n---   \nb'
    const chunks = splitSlides(raw)
    expect(chunks).toHaveLength(2)
  })
})

describe('extractSlideConfig', () => {
  it('no yaml fence -> type content, whole chunk is body', () => {
    const config = extractSlideConfig({ raw: 'just plain **markdown**' })
    expect(config.type).toBe('content')
    expect(config.body).toBe('just plain **markdown**')
  })

  it('parses a yaml fence and separates body', () => {
    const raw = ['```yaml', 'type: content', 'title: "Hello"', '```', '', 'body text here'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.title).toBe('Hello')
    expect(config.body).toBe('body text here')
  })

  it('unrecognized type falls back to content', () => {
    const raw = ['```yaml', 'type: bogus-type', 'title: "X"', '```'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.title).toBe('X')
  })

  it('missing type falls back to content', () => {
    const raw = ['```yaml', 'title: "X"', '```'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
  })

  it('two-column columns not exactly 2 entries -> pad/truncate to 2', () => {
    const raw1 = ['```yaml', 'type: two-column', 'columns:', '  - "only one"', '```'].join('\n')
    const c1 = extractSlideConfig({ raw: raw1 })
    expect(c1.columns).toEqual(['only one', ''])

    const raw3 = ['```yaml', 'type: two-column', 'columns:', '  - "a"', '  - "b"', '  - "c"', '```'].join('\n')
    const c3 = extractSlideConfig({ raw: raw3 })
    expect(c3.columns).toEqual(['a', 'b'])

    const raw0 = ['```yaml', 'type: two-column', '```'].join('\n')
    const c0 = extractSlideConfig({ raw: raw0 })
    expect(c0.columns).toEqual(['', ''])
  })

  it('malformed yaml -> falls back to content with raw fence text folded into body', () => {
    const raw = ['```yaml', 'type: content', '  bad: [unclosed', '```', 'trailing body'].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.rawFenceFallback).toContain('bad: [unclosed')
    expect(config.body).toContain('bad: [unclosed')
    expect(config.body).toContain('trailing body')
  })

  it('never throws on malformed yaml', () => {
    const raw = ['```yaml', ':::: not yaml at all ::::', '```'].join('\n')
    expect(() => extractSlideConfig({ raw })).not.toThrow()
  })

  it('propagates universal fields: notes, footer, style', () => {
    const raw = [
      '```yaml',
      'type: content',
      'title: "T"',
      'notes: "speaker notes"',
      'footer:',
      '  show: false',
      '  right: "confidential"',
      'style:',
      '  title:',
      '    color: "#ffffff"',
      '```',
      'body',
    ].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.notes).toBe('speaker notes')
    expect(config.footer).toEqual({ show: false, right: 'confidential' })
    expect(config.style).toEqual({ title: { color: '#ffffff' } })
  })

  it('invalid style/footer keys are dropped but do not remove the slide', () => {
    const raw = [
      '```yaml',
      'type: content',
      'footer: "not an object"',
      'style:',
      '  title:',
      '    color: "not-a-color"',
      '    fontSize: "44px"',
      '```',
    ].join('\n')
    const config = extractSlideConfig({ raw })
    expect(config.type).toBe('content')
    expect(config.footer).toBeUndefined()
    expect(config.style).toEqual({ title: { fontSize: '44px' } })
  })

  it('every fallback path resolves a type, never drops the slide', () => {
    const inputs = [
      'no fence at all',
      ['```yaml', 'type: content', '```'].join('\n'),
      ['```yaml', 'type: unknown-thing', '```'].join('\n'),
      ['```yaml', '  [[[ malformed', '```'].join('\n'),
    ]
    for (const raw of inputs) {
      const config = extractSlideConfig({ raw })
      expect(config.type).toBeTruthy()
      expect(typeof config.body).toBe('string')
    }
  })
})

describe('isDeckChunk', () => {
  it('returns true for a chunk whose yaml fence has type: deck', () => {
    const raw = ['```yaml', 'type: deck', 'footer:', '  left: "DevHub"', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(true)
  })

  it('returns false for a chunk with a different type', () => {
    const raw = ['```yaml', 'type: content', 'title: "X"', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(false)
  })

  it('returns false for a chunk with no yaml fence', () => {
    expect(isDeckChunk({ raw: 'just markdown' })).toBe(false)
  })

  it('returns false for malformed yaml (never throws)', () => {
    const raw = ['```yaml', ':::: not yaml ::::', '```'].join('\n')
    expect(() => isDeckChunk({ raw })).not.toThrow()
    expect(isDeckChunk({ raw })).toBe(false)
  })

  it('returns false when the yaml fence holds a scalar/array, not a mapping', () => {
    const raw = ['```yaml', '- just an array', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(false)
  })
})

describe('extractDeckConfig', () => {
  it('extracts style and footer from a type: deck chunk', () => {
    const raw = [
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      'footer:',
      '  left: "DevHub"',
      '  pageNumber: true',
      '```',
    ].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.style).toEqual({ background: { color: '#0f172a' } })
    expect(config.footer).toEqual({ left: 'DevHub', pageNumber: true })
  })

  it('ignores fields other than style/footer (e.g. a stray title)', () => {
    const raw = ['```yaml', 'type: deck', 'title: "Ignored"', 'footer:', '  left: "L"', '```'].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.footer).toEqual({ left: 'L' })
    expect((config as Record<string, unknown>).title).toBeUndefined()
  })

  it('applies the same style/footer guardrails as per-slide config', () => {
    const raw = [
      '```yaml',
      'type: deck',
      'style:',
      '  title:',
      '    color: "not-a-color"',
      '    fontSize: "3em"',
      '```',
    ].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.style).toEqual({ title: { fontSize: '3em' } })
  })

  it('returns {} for a chunk with no yaml fence', () => {
    expect(extractDeckConfig({ raw: 'no fence here' })).toEqual({})
  })

  it('returns {} for malformed yaml (never throws)', () => {
    const raw = ['```yaml', ':::: not yaml ::::', '```'].join('\n')
    expect(() => extractDeckConfig({ raw })).not.toThrow()
    expect(extractDeckConfig({ raw })).toEqual({})
  })

  it('returns {} when neither style nor footer is present', () => {
    const raw = ['```yaml', 'type: deck', '```'].join('\n')
    expect(extractDeckConfig({ raw })).toEqual({})
  })
})

describe('SLIDE_LAYOUTS registry', () => {
  it('has an entry for every slide type', () => {
    const expected = ['title', 'section', 'content', 'two-column', 'image-focus']
    expect(Object.keys(SLIDE_LAYOUTS).sort()).toEqual(expected.sort())
    for (const type of expected) {
      expect(typeof SLIDE_LAYOUTS[type as keyof typeof SLIDE_LAYOUTS]).toBe('function')
    }
  })
})
