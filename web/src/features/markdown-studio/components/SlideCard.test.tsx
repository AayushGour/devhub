// Dev-authored unit tests for SlideCard's footer and style merge wiring (see
// project-context.md footer/style AC and the deck-level-config design doc). Complements
// the tester-authored acceptance suite in SlideCard.acceptance.test.tsx — this file
// covers the mergeFooter/deckFooter and mergeSlideStyle/deckStyle plumbing itself
// (default props, per-field inheritance, the page-number-in-footer behavior) rather
// than re-deriving every AC scenario.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SlideCard from './SlideCard'
import { DEFAULT_DECK_FOOTER } from '../utils/slideStyle'
import type { SlideConfig } from '../utils/slideParser'

afterEach(cleanup)

function baseConfig(overrides: Partial<SlideConfig> = {}): SlideConfig {
  return { type: 'content', body: '', ...overrides }
}

describe('SlideCard footer wiring', () => {
  it('uses DEFAULT_DECK_FOOTER when no deckFooter prop is passed (footer visible, page numbers off by default)', async () => {
    expect(DEFAULT_DECK_FOOTER).toEqual({ show: true, left: '', center: '', right: '', pageNumber: false })
    const { container } = render(<SlideCard config={baseConfig()} pageNumber={1} />)
    // show:true + all text fields empty + pageNumber off -> footer element renders but with no visible text.
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('renders no footer element at all when the merged footer resolves show:false', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ footer: { show: false } })}
        pageNumber={1}
        deckFooter={{ show: true, left: 'x', center: 'y', right: 'z', pageNumber: true }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).toBeNull())
  })

  it('slide footer fully overrides all fields when every field is specified', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({
          footer: { show: true, left: 'A', center: 'B', right: 'C', pageNumber: false },
        })}
        pageNumber={5}
        deckFooter={{ show: true, left: 'deckA', center: 'deckB', right: 'deckC', pageNumber: true }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('A')
    expect(footer?.textContent).toContain('B')
    expect(footer?.textContent).toContain('C')
    expect(footer?.textContent).not.toContain('deckA')
    expect(footer?.textContent).not.toContain('5') // pageNumber:false overrides deck's true
  })

  it('footer element sits outside the .slide-page__content transform wrapper (not shrunk/clipped with the body)', async () => {
    const { container } = render(
      <SlideCard config={baseConfig({ footer: { show: true, left: 'Chrome text' } })} pageNumber={1} />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    const content = container.querySelector('.slide-page__content')
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    expect(content?.contains(footer as Node)).toBe(false)
  })

  it('shows the page number inside the footer only when the merged footer.pageNumber is true', async () => {
    const { container, rerender } = render(
      <SlideCard config={baseConfig({ footer: { pageNumber: true } })} pageNumber={7} />
    )
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')?.textContent).toContain('7')

    rerender(<SlideCard config={baseConfig({ footer: { pageNumber: false } })} pageNumber={7} />)
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})

describe('SlideCard deckStyle wiring', () => {
  it('applies deck-level style to a slide with no style of its own', async () => {
    const { container } = render(
      <SlideCard config={baseConfig()} pageNumber={1} deckStyle={{ background: { color: '#0f172a' } }} />
    )
    await waitFor(() => expect(container.querySelector('.slide-card')).not.toBeNull())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)') // #0f172a
  })

  it('slide style overrides only the matching deck property, other deck properties still apply', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ style: { title: { color: '#ffffff' } } })}
        pageNumber={1}
        deckStyle={{ background: { color: '#0f172a' }, title: { fontSize: '2em' } }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-card')).not.toBeNull())
    const card = container.querySelector('.slide-card') as HTMLElement
    // deck background still applies (slide didn't override it)
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)')
  })
})
