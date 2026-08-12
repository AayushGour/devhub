// Tester-authored AC-driven acceptance suite for SlideCard (preview stack unit).
// Maps to project-context.md AC bullets under "PreviewPane show my doc as a stack of
// slide cards" + universal fields (notes/footer/style) + overflow badge.
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SlideCard from './SlideCard'
import { OVERFLOW_SCALE_FLOOR } from '../utils/slideOverflow'
import { buildSlidePrintDoc } from '../utils/slideExport'
import { defaultExportConfig } from '../utils/pdfExport'
import type { SlideConfig } from '../utils/slideParser'

afterEach(cleanup)

function baseConfig(overrides: Partial<SlideConfig> = {}): SlideConfig {
  return { type: 'content', body: '', ...overrides }
}

describe('AC: SlideCard shows the page number in the footer, opt-in via footer.pageNumber (default OFF)', () => {
  it('renders the given pageNumber inside the footer when footer.pageNumber is true', async () => {
    render(<SlideCard config={baseConfig({ title: 'X', footer: { pageNumber: true } })} pageNumber={3} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('does NOT render a page number when footer.pageNumber is not set (new default: off)', async () => {
    render(<SlideCard config={baseConfig({ title: 'X' })} pageNumber={3} />)
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument())
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})

describe('AC: overflow badge is preview-only, appears only when clipped', () => {
  it('does NOT show "content overflows" badge for normal (non-overflowing) content in jsdom (scrollHeight=0 default)', async () => {
    render(<SlideCard config={baseConfig({ title: 'Fits fine', body: 'short body' })} pageNumber={1} />)
    await waitFor(() => expect(screen.getByText('Fits fine')).toBeInTheDocument())
    expect(screen.queryByText(/content overflows/i)).not.toBeInTheDocument()
  })

  describe('with stubbed scrollHeight/clientHeight simulating real overflow', () => {
    let originalScrollHeight: PropertyDescriptor | undefined
    let originalClientHeight: PropertyDescriptor | undefined

    beforeAll(() => {
      originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
      originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
      // Simulate content far taller than the box (severe overflow -> floors + clips).
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) { return this.classList.contains('slide-page__content') ? 3000 : 0 },
      })
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get(this: HTMLElement) { return this.classList.contains('slide-card') ? 500 : 0 },
      })
    })
    afterAll(() => {
      if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
      if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
    })

    it('shows the "content overflows" badge and clips the box when content is far taller than the box', async () => {
      render(<SlideCard config={baseConfig({ title: 'Overflowing', body: 'x'.repeat(500) })} pageNumber={1} />)
      await waitFor(() => expect(screen.getByText(/content overflows/i)).toBeInTheDocument())
    })

    it('applies transform: scale(FLOOR) to the content wrapper when clipped at the floor', async () => {
      const { container } = render(<SlideCard config={baseConfig({ title: 'Overflowing', body: 'x'.repeat(500) })} pageNumber={1} />)
      await waitFor(() => screen.getByText(/content overflows/i))
      const content = container.querySelector('.slide-page__content') as HTMLElement
      expect(content.style.transform).toBe(`scale(${OVERFLOW_SCALE_FLOOR})`)
      expect(content.style.overflow).toBe('hidden')
    })
  })
})

describe('FIXED (was KNOWN GAP): the overflow badge still renders in the live preview DOM subtree, but buildSlidePrintDoc strips it before it reaches exported output', () => {
  let originalScrollHeight: PropertyDescriptor | undefined
  let originalClientHeight: PropertyDescriptor | undefined

  beforeAll(() => {
    originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains('slide-page__content') ? 3000 : 0 },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains('slide-card') ? 500 : 0 },
    })
  })
  afterAll(() => {
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
    if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  })

  it('badge text IS present in the live preview subtree (still visible to the user in preview)', async () => {
    // Mirrors what SlideDeckPreview renders: a wrapper div (analogous to the real
    // ".slide-page" wrapper) containing SlideCard.
    const { container } = render(
      <div className="slide-page">
        <SlideCard config={baseConfig({ title: 'Overflowing', body: 'x'.repeat(500) })} pageNumber={1} />
      </div>
    )
    await waitFor(() => expect(screen.getByText(/content overflows/i)).toBeInTheDocument())
    expect(container.innerHTML).toContain('content overflows')
  })

  it('badge text is ABSENT once that same preview DOM is passed through buildSlidePrintDoc (export path)', async () => {
    // exportDeckToPDF reads previewEl.innerHTML and hands it to buildSlidePrintDoc, which
    // now strips `.slide-overflow-badge` elements before serializing the print document —
    // this is the actual export-path guarantee, not just "the component doesn't render it".
    const { container } = render(
      <div className="slide-page">
        <SlideCard config={baseConfig({ title: 'Overflowing', body: 'x'.repeat(500) })} pageNumber={1} />
      </div>
    )
    await waitFor(() => expect(screen.getByText(/content overflows/i)).toBeInTheDocument())
    expect(container.innerHTML).toContain('content overflows') // still true of the raw preview DOM

    const printDoc = buildSlidePrintDoc(container.innerHTML, defaultExportConfig('Deck'))
    expect(printDoc).not.toContain('content overflows')
    expect(printDoc).not.toContain('slide-overflow-badge')
  })
})

describe('AC: notes are shown in editor/preview only per spec, but SlideCard/layouts never render notes text into DOM', () => {
  it('config.notes text never appears in the rendered card DOM', async () => {
    const notesText = 'PREVIEW-DOM-SENTINEL-NOTES'
    const { container } = render(
      <SlideCard config={baseConfig({ type: 'content', title: 'T', body: 'body', notes: notesText })} pageNumber={1} />
    )
    await waitFor(() => expect(screen.getByText('T')).toBeInTheDocument())
    expect(container.innerHTML).not.toContain(notesText)
  })
})

describe('AC: per-slide style wrapper (background) is applied via SlideCard using slideStyleToReactStyle', () => {
  it('applies background color from config.style to the card wrapper element', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Styled', style: { background: { color: '#123456' } } })}
        pageNumber={1}
      />
    )
    await waitFor(() => expect(screen.getByText('Styled')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.style.backgroundColor).toBe('rgb(18, 52, 86)') // #123456
  })
})

describe('FIXED (was KNOWN GAP): footer is wired up — SlideCard renders a .slide-page__footer element driven by mergeFooter(config.footer, deckFooter)', () => {
  it('SlideCard renders a .slide-page__footer element with the slide footer text when config.footer is set', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({
          type: 'content',
          title: 'Has footer config',
          footer: { show: true, left: 'Left text', center: 'Center text', right: 'Right text' },
        })}
        pageNumber={1}
      />
    )
    await waitFor(() => expect(screen.getByText('Left text')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain('Left text')
    expect(footer?.textContent).toContain('Center text')
    expect(footer?.textContent).toContain('Right text')
  })

  it('footer.show:false hides the footer on that slide only', async () => {
    const { container } = render(
      <SlideCard config={baseConfig({ type: 'content', title: 'No footer', footer: { show: false, left: 'Hidden left' } })} pageNumber={1} />
    )
    await waitFor(() => expect(screen.getByText('No footer')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')).toBeNull()
    expect(container.textContent).not.toContain('Hidden left')
  })

  it('omitted footer fields inherit the deck-level default for that field individually', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Partial footer', footer: { left: 'Slide left' } })}
        pageNumber={2}
        deckFooter={{ show: true, left: 'Deck left', center: 'Deck center', right: 'Deck right', pageNumber: true }}
      />
    )
    await waitFor(() => expect(screen.getByText('Slide left')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    // slide overrides left, inherits center/right from deck
    expect(footer?.textContent).toContain('Slide left')
    expect(footer?.textContent).toContain('Deck center')
    expect(footer?.textContent).toContain('Deck right')
    expect(footer?.textContent).not.toContain('Deck left')
  })

  it('footer.show omitted inherits deckFooter.show (deck default hides the footer)', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Inherit show' })}
        pageNumber={1}
        deckFooter={{ show: false, left: '', center: '', right: '', pageNumber: true }}
      />
    )
    await waitFor(() => expect(screen.getByText('Inherit show')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')).toBeNull()
  })
})
