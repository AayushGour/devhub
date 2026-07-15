// Tester-authored AC-driven acceptance suite for per-slide style/footer guardrails.
// Maps to project-context.md Business rules "CSS value guardrails" + "Footer merge semantics".
// Complements (does not duplicate) the dev-authored slideStyle.test.ts.
import { describe, it, expect } from 'vitest'
import { validateSlideStyle, validateSlideFooter, mergeFooter, FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX } from './slideStyle'

describe('AC: each style guardrail rejects individually, per-key granularity, rest of style still applies', () => {
  it('bad color on ONE key does not affect a valid color on a sibling key', () => {
    const style = validateSlideStyle({
      background: { color: 'not-a-color' },
      title: { color: '#fff' },
      body: { color: 'also-not-a-color' },
    })
    expect(style.background).toBeUndefined()
    expect(style.title?.color).toBe('#fff')
    expect(style.body).toBeUndefined()
  })

  it('fontSize unparsable (no unit) is rejected, sibling fontSize on another category unaffected', () => {
    const style = validateSlideStyle({
      title: { fontSize: '48' }, // missing unit -> fails regex
      body: { fontSize: '18px' },
    })
    expect(style.title).toBeUndefined()
    expect(style.body?.fontSize).toBe('18px')
  })

  it(`fontSize exactly at MIN (${FONT_SIZE_MIN_PX}px) is accepted; one px under is rejected`, () => {
    expect(validateSlideStyle({ title: { fontSize: `${FONT_SIZE_MIN_PX}px` } }).title?.fontSize).toBe(`${FONT_SIZE_MIN_PX}px`)
    expect(validateSlideStyle({ title: { fontSize: `${FONT_SIZE_MIN_PX - 1}px` } }).title?.fontSize).toBeUndefined()
  })

  it(`fontSize exactly at MAX (${FONT_SIZE_MAX_PX}px) is accepted; one px over is rejected`, () => {
    expect(validateSlideStyle({ body: { fontSize: `${FONT_SIZE_MAX_PX}px` } }).body?.fontSize).toBe(`${FONT_SIZE_MAX_PX}px`)
    expect(validateSlideStyle({ body: { fontSize: `${FONT_SIZE_MAX_PX + 1}px` } }).body?.fontSize).toBeUndefined()
  })

  it('non-enum align is rejected, does not clobber a valid color on the same title category', () => {
    const style = validateSlideStyle({ title: { color: '#123', align: 'justify' as unknown as string } })
    expect(style.title?.color).toBe('#123')
    expect(style.title?.align).toBeUndefined()
  })

  it('non-http(s) background.image (javascript:) rejected, background.color on same category still applies', () => {
    const style = validateSlideStyle({
      background: { color: '#000', image: 'javascript:alert(1)' },
    })
    expect(style.background?.color).toBe('#000')
    expect(style.background?.image).toBeUndefined()
  })

  it('non-http(s) background.image (data:) rejected', () => {
    const style = validateSlideStyle({ background: { image: 'data:text/html,<script>alert(1)</script>' } })
    expect(style.background?.image).toBeUndefined()
  })

  it('relative/protocol-relative image urls are rejected (must be explicit http/https)', () => {
    expect(validateSlideStyle({ background: { image: '//example.com/a.png' } }).background?.image).toBeUndefined()
    expect(validateSlideStyle({ background: { image: '/local/a.png' } }).background?.image).toBeUndefined()
  })

  it('non-object style (string/number/array) -> whole field ignored, returns {}', () => {
    expect(validateSlideStyle('background: red')).toEqual({})
    expect(validateSlideStyle(42)).toEqual({})
    expect(validateSlideStyle([{ title: { color: '#fff' } }])).toEqual({})
  })

  it('unknown category is ignored entirely but known categories in the same object still apply', () => {
    const style = validateSlideStyle({
      animation: { type: 'fade' }, // unknown category, out of v1's fixed 3
      title: { color: '#fff' },
    })
    expect((style as Record<string, unknown>).animation).toBeUndefined()
    expect(style.title?.color).toBe('#fff')
  })

  it('unknown property within a known category is ignored, known sibling properties still apply', () => {
    const style = validateSlideStyle({
      title: { color: '#fff', fontWeight: 'bold', letterSpacing: '2px' },
    })
    expect(style.title).toEqual({ color: '#fff' })
  })

  it('4th nesting level (e.g. style.title.color.hue) is simply not read; validators only look at known scalar props', () => {
    const style = validateSlideStyle({ title: { color: { hue: 200 } } })
    expect(style.title).toBeUndefined()
  })
})

describe('AC: footer field-level merge over deck footer (per-slide overrides only specified keys)', () => {
  const deckDefaults = { show: true, left: 'DeckL', center: 'DeckC', right: 'DeckR', pageNumber: true }

  it('slide overrides exactly one field, inherits the rest individually', () => {
    const merged = mergeFooter({ left: 'SlideL' }, deckDefaults)
    expect(merged).toEqual({ show: true, left: 'SlideL', center: 'DeckC', right: 'DeckR', pageNumber: true })
  })

  it('slide overrides multiple-but-not-all fields', () => {
    const merged = mergeFooter({ center: 'SlideC', pageNumber: false }, deckDefaults)
    expect(merged).toEqual({ show: true, left: 'DeckL', center: 'SlideC', right: 'DeckR', pageNumber: false })
  })

  it('non-object footer (string) -> validateSlideFooter returns {}, so slide fully inherits deck footer', () => {
    const validated = validateSlideFooter('not-an-object')
    expect(validated).toEqual({})
    const merged = mergeFooter(validated, deckDefaults)
    expect(merged).toEqual(deckDefaults)
  })

  it('footer.show:false hides footer on that slide only — merge preserves show:false without touching siblings', () => {
    const merged = mergeFooter({ show: false }, deckDefaults)
    expect(merged.show).toBe(false)
    expect(merged.left).toBe('DeckL')
    expect(merged.center).toBe('DeckC')
    expect(merged.right).toBe('DeckR')
    // A second slide with no footer override must still show the deck-level footer
    // (i.e. show:false is scoped to the one slide, not global).
    const otherSlideMerged = mergeFooter(undefined, deckDefaults)
    expect(otherSlideMerged.show).toBe(true)
  })

  it('unknown footer key is ignored by validateSlideFooter, known keys still merge correctly', () => {
    const validated = validateSlideFooter({ left: 'X', bogusKey: 'ignored' })
    expect(validated).toEqual({ left: 'X' })
    const merged = mergeFooter(validated, deckDefaults)
    expect(merged).toEqual({ ...deckDefaults, left: 'X' })
  })
})
