import { describe, it, expect } from 'vitest'
import {
  validateSlideStyle, validateSlideFooter, mergeFooter, mergeSlideStyle, slideStyleToReactStyle,
  FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX,
} from './slideStyle'

describe('validateSlideStyle', () => {
  it('accepts hex and rgb(a) colors', () => {
    const style = validateSlideStyle({
      background: { color: '#fff' },
      title: { color: '#123abc' },
      body: { color: 'rgba(10, 20, 30, 0.5)' },
    })
    expect(style.background?.color).toBe('#fff')
    expect(style.title?.color).toBe('#123abc')
    expect(style.body?.color).toBe('rgba(10, 20, 30, 0.5)')
  })

  it('rejects invalid colors and drops just that key', () => {
    const style = validateSlideStyle({
      title: { color: 'not-a-color', fontSize: '20px' },
    })
    expect(style.title?.color).toBeUndefined()
    expect(style.title?.fontSize).toBe('20px')
  })

  it('accepts fontSize within the clamp range for px/em/rem/pt', () => {
    const style = validateSlideStyle({
      title: { fontSize: '44px' },
      body: { fontSize: '1.5em' },
    })
    expect(style.title?.fontSize).toBe('44px')
    expect(style.body?.fontSize).toBe('1.5em')
  })

  it('rejects fontSize failing the regex', () => {
    const style = validateSlideStyle({ title: { fontSize: '44' } })
    expect(style.title?.fontSize).toBeUndefined()
  })

  it(`rejects fontSize below ${FONT_SIZE_MIN_PX}px equivalent`, () => {
    const style = validateSlideStyle({ title: { fontSize: '2px' } })
    expect(style.title?.fontSize).toBeUndefined()
  })

  it(`rejects fontSize above ${FONT_SIZE_MAX_PX}px equivalent`, () => {
    const style = validateSlideStyle({ title: { fontSize: '999px' } })
    expect(style.title?.fontSize).toBeUndefined()
  })

  it('rejects out-of-range em/pt after unit conversion', () => {
    // 10em * 16px base = 160px > 120 max
    const tooLarge = validateSlideStyle({ title: { fontSize: '10em' } })
    expect(tooLarge.title?.fontSize).toBeUndefined()
    // 100pt * (96/72) = 133.3px > 120 max
    const tooLargePt = validateSlideStyle({ body: { fontSize: '100pt' } })
    expect(tooLargePt.body?.fontSize).toBeUndefined()
  })

  it('accepts align enum values only', () => {
    expect(validateSlideStyle({ title: { align: 'center' } }).title?.align).toBe('center')
    expect(validateSlideStyle({ title: { align: 'left' } }).title?.align).toBe('left')
    expect(validateSlideStyle({ title: { align: 'right' } }).title?.align).toBe('right')
    expect(validateSlideStyle({ title: { align: 'justify' } }).title?.align).toBeUndefined()
  })

  it('accepts only http(s) background.image urls', () => {
    expect(validateSlideStyle({ background: { image: 'https://example.com/a.png' } }).background?.image)
      .toBe('https://example.com/a.png')
    expect(validateSlideStyle({ background: { image: 'http://example.com/a.png' } }).background?.image)
      .toBe('http://example.com/a.png')
    expect(validateSlideStyle({ background: { image: 'javascript:alert(1)' } }).background?.image)
      .toBeUndefined()
    expect(validateSlideStyle({ background: { image: 'data:image/png;base64,xx' } }).background?.image)
      .toBeUndefined()
  })

  it('ignores unknown categories and unknown properties', () => {
    const style = validateSlideStyle({
      foo: { bar: 'baz' },
      title: { color: '#fff', unknownProp: 'x' },
    })
    expect((style as Record<string, unknown>).foo).toBeUndefined()
    expect(style.title).toEqual({ color: '#fff' })
  })

  it('returns {} for non-object input', () => {
    expect(validateSlideStyle(null)).toEqual({})
    expect(validateSlideStyle(undefined)).toEqual({})
    expect(validateSlideStyle('a string')).toEqual({})
    expect(validateSlideStyle(['array'])).toEqual({})
  })
})

describe('validateSlideFooter', () => {
  it('accepts known keys', () => {
    const footer = validateSlideFooter({ show: false, left: 'L', center: 'C', right: 'R', pageNumber: true })
    expect(footer).toEqual({ show: false, left: 'L', center: 'C', right: 'R', pageNumber: true })
  })

  it('ignores unknown keys', () => {
    const footer = validateSlideFooter({ left: 'L', bogus: 'nope' })
    expect(footer).toEqual({ left: 'L' })
  })

  it('returns {} for non-object input', () => {
    expect(validateSlideFooter('nope')).toEqual({})
    expect(validateSlideFooter(null)).toEqual({})
  })
})

describe('mergeFooter', () => {
  const deckDefaults = { show: true, left: 'DeckLeft', center: 'DeckCenter', right: 'DeckRight', pageNumber: true }

  it('field-level merges: slide fields override, omitted fields inherit deck', () => {
    const merged = mergeFooter({ right: 'SlideRight' }, deckDefaults)
    expect(merged).toEqual({ show: true, left: 'DeckLeft', center: 'DeckCenter', right: 'SlideRight', pageNumber: true })
  })

  it('slide footer.show:false hides only that slide footer', () => {
    const merged = mergeFooter({ show: false }, deckDefaults)
    expect(merged.show).toBe(false)
    expect(merged.left).toBe('DeckLeft')
  })

  it('undefined slide footer inherits all deck defaults', () => {
    const merged = mergeFooter(undefined, deckDefaults)
    expect(merged).toEqual(deckDefaults)
  })
})

describe('slideStyleToReactStyle', () => {
  it('maps style categories to React.CSSProperties objects', () => {
    const react = slideStyleToReactStyle({
      background: { color: '#000', image: 'https://x.com/a.png' },
      title: { color: '#fff', fontSize: '40px', align: 'center' },
      body: { color: '#eee', fontSize: '18px' },
    })
    expect(react.wrapper.backgroundColor).toBe('#000')
    expect(react.wrapper.backgroundImage).toContain('https://x.com/a.png')
    expect(react.title.color).toBe('#fff')
    expect(react.title.fontSize).toBe('40px')
    expect(react.title.textAlign).toBe('center')
    expect(react.body.color).toBe('#eee')
    expect(react.body.fontSize).toBe('18px')
  })

  it('returns empty style objects for undefined style', () => {
    const react = slideStyleToReactStyle(undefined)
    expect(react.wrapper).toEqual({})
    expect(react.title).toEqual({})
    expect(react.body).toEqual({})
  })
})

describe('mergeSlideStyle', () => {
  it('a slide with no style of its own inherits the full deck style', () => {
    const deckStyle = { background: { color: '#0f172a' }, title: { fontSize: '2em' } }
    const merged = mergeSlideStyle(deckStyle, undefined)
    expect(merged).toEqual(deckStyle)
  })

  it('a slide style category not present in the deck style is kept as-is', () => {
    const deckStyle = { background: { color: '#0f172a' } }
    const slideStyle = { title: { color: '#ffffff' } }
    const merged = mergeSlideStyle(deckStyle, slideStyle)
    expect(merged).toEqual({ background: { color: '#0f172a' }, title: { color: '#ffffff' } })
  })

  it('field-level merge within a shared category: slide property overrides, other deck properties in that category survive', () => {
    const deckStyle = { title: { color: '#0f172a', fontSize: '2em', align: 'left' as const } }
    const slideStyle = { title: { color: '#ffffff' } }
    const merged = mergeSlideStyle(deckStyle, slideStyle)
    expect(merged.title).toEqual({ color: '#ffffff', fontSize: '2em', align: 'left' })
  })

  it('empty deck style + no slide style yields {}', () => {
    expect(mergeSlideStyle({}, undefined)).toEqual({})
  })

  it('empty deck style + a slide style returns just the slide style', () => {
    const slideStyle = { body: { fontSize: '1.1em' } }
    expect(mergeSlideStyle({}, slideStyle)).toEqual(slideStyle)
  })
})
