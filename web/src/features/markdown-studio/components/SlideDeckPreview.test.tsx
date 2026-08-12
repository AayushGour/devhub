// Integration-level tests for the type: deck partition + deck-level style/footer
// field-merge propagation into rendered SlideCards (see
// docs/superpowers/specs/2026-07-15-deck-level-config-design.md).
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SlideDeckPreview from './SlideDeckPreview'

afterEach(cleanup)

describe('SlideDeckPreview deck-level config (type: deck)', () => {
  it('a type: deck chunk is not rendered as a slide', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Only Slide"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Only Slide')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
  })

  it('deck footer defaults apply to a slide with no footer of its own', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '  pageNumber: true',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('DevHub')
    expect(footer?.textContent).toContain('1') // pageNumber from deck default
  })

  it('a slide footer field overrides the deck default for that field only', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '  right: "Confidential"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      'footer:',
      '  right: "Public"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('DevHub')
    expect(footer?.textContent).toContain('Public')
    expect(footer?.textContent).not.toContain('Confidential')
  })

  it('deck style defaults apply to a slide with no style of its own', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)')
  })

  it('a slide style property overrides the deck default for that property only, other deck properties still apply', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      '  title:',
      '    fontSize: "2em"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      'style:',
      '  title:',
      '    color: "#ffffff"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)') // deck default kept
    const title = card.querySelector('h2') as HTMLElement
    expect(title.style.color).toBe('rgb(255, 255, 255)') // slide override
    expect(title.style.fontSize).toBe('2em') // deck default kept (slide didn't override fontSize)
  })

  it('first type: deck block wins when multiple exist; the rest are also not rendered as slides', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "First"',
      '```',
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "Second"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('First')
    expect(footer?.textContent).not.toContain('Second')
  })

  it('no type: deck block: all chunks render as slides, deck defaults are built-in (page numbers off)', async () => {
    const content = ['---', '```yaml', 'type: content', 'title: "Slide A"', '```', 'body'].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
    expect(screen.queryByText('1')).not.toBeInTheDocument() // page numbers off by default
  })
})
