// Tester-authored AC-driven acceptance suite for the 5 v1 slide layout components.
// Maps to project-context.md AC: "each type's yaml slots and body-markdown use
// documented and enforced" + "Layouts never parse markdown themselves ... only
// arrange already-rendered HTML fragments into a CSS grid."
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TitleLayout from './TitleLayout'
import SectionLayout from './SectionLayout'
import ContentLayout from './ContentLayout'
import TwoColumnLayout from './TwoColumnLayout'
import ImageFocusLayout from './ImageFocusLayout'
import * as parserModule from '../../utils/parser'
import type { SlideConfig, SlideRenderInput } from '../../utils/slideParser'

function baseConfig(overrides: Partial<SlideConfig> = {}): SlideConfig {
  return { type: 'content', body: '', ...overrides }
}

describe('AC: layouts never call parseMarkdown themselves — they only arrange pre-rendered HTML', () => {
  it('none of the 5 layouts invoke parseMarkdown when rendered with pre-rendered html props', () => {
    const spy = vi.spyOn(parserModule, 'parseMarkdown')
    spy.mockClear()

    const input: SlideRenderInput = {
      config: baseConfig({
        type: 'two-column',
        title: 'T',
        columns: ['left raw markdown', 'right raw markdown'],
        caption: 'cap raw markdown',
      }),
      bodyHtml: '<p>already-rendered body</p>',
      columnsHtml: ['<p>already-rendered left</p>', '<p>already-rendered right</p>'],
      captionHtml: '<p>already-rendered caption</p>',
    }

    render(<TitleLayout {...input} />)
    render(<SectionLayout {...input} />)
    render(<ContentLayout {...input} />)
    render(<TwoColumnLayout {...input} />)
    render(<ImageFocusLayout {...{ ...input, config: { ...input.config, image: 'https://x.com/a.png' } }} />)

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('AC: title layout arranges title/subtitle/author/date, ignores body', () => {
  it('renders all 4 slots and does not render bodyHtml content', () => {
    const input: SlideRenderInput = {
      config: baseConfig({ type: 'title', title: 'Deck Title', subtitle: 'Sub', author: 'Author X', date: '2026-07-14' }),
      bodyHtml: '<p>SHOULD NOT APPEAR</p>',
    }
    const { container } = render(<TitleLayout {...input} />)
    expect(screen.getByText('Deck Title')).toBeInTheDocument()
    expect(screen.getByText('Sub')).toBeInTheDocument()
    expect(screen.getByText('Author X')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('SHOULD NOT APPEAR')
  })

  it('gracefully omits missing optional slots without throwing', () => {
    const input: SlideRenderInput = { config: baseConfig({ type: 'title' }), bodyHtml: '' }
    expect(() => render(<TitleLayout {...input} />)).not.toThrow()
  })
})

describe('AC: section layout arranges only title slot, ignores body', () => {
  it('renders title, does not render bodyHtml', () => {
    const input: SlideRenderInput = {
      config: baseConfig({ type: 'section', title: 'Section Title' }),
      bodyHtml: '<p>SHOULD NOT APPEAR</p>',
    }
    const { container } = render(<SectionLayout {...input} />)
    expect(screen.getByText('Section Title')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('SHOULD NOT APPEAR')
  })
})

describe('AC: content layout arranges optional title + full bodyHtml', () => {
  it('renders title and injects bodyHtml verbatim', () => {
    const input: SlideRenderInput = {
      config: baseConfig({ type: 'content', title: 'Content Title' }),
      bodyHtml: '<ul><li>item one</li></ul>',
    }
    const { container } = render(<ContentLayout {...input} />)
    expect(screen.getByText('Content Title')).toBeInTheDocument()
    expect(container.querySelector('li')?.textContent).toBe('item one')
  })

  it('title slot is optional — omitting it renders no title element but still renders body', () => {
    const input: SlideRenderInput = { config: baseConfig({ type: 'content' }), bodyHtml: '<p>just body</p>' }
    const { container } = render(<ContentLayout {...input} />)
    expect(container.querySelector('h2')).toBeNull()
    expect(container.textContent).toContain('just body')
  })
})

describe('AC: two-column layout arranges title + exactly 2 columnsHtml slots', () => {
  it('renders both columns in a 2-col grid', () => {
    const input: SlideRenderInput = {
      config: baseConfig({ type: 'two-column', title: 'Compare', columns: ['a', 'b'] }),
      bodyHtml: '',
      columnsHtml: ['<p>Left column</p>', '<p>Right column</p>'],
    }
    const { container } = render(<TwoColumnLayout {...input} />)
    expect(screen.getByText('Compare')).toBeInTheDocument()
    expect(container.textContent).toContain('Left column')
    expect(container.textContent).toContain('Right column')
    expect(container.querySelectorAll('.grid-cols-2 > div')).toHaveLength(2)
  })

  it('missing columnsHtml (undefined) renders empty columns rather than throwing', () => {
    const input: SlideRenderInput = { config: baseConfig({ type: 'two-column' }), bodyHtml: '' }
    expect(() => render(<TwoColumnLayout {...input} />)).not.toThrow()
  })
})

describe('AC: image-focus layout arranges title + image + optional caption + optional side body', () => {
  it('renders image, caption, and side body when all present', () => {
    const input: SlideRenderInput = {
      config: baseConfig({ type: 'image-focus', title: 'Screenshot', image: 'https://example.com/shot.png', caption: 'cap' }),
      bodyHtml: '<p>side text</p>',
      captionHtml: '<p>Landscape preview cards</p>',
    }
    const { container } = render(<ImageFocusLayout {...input} />)
    expect(screen.getByText('Screenshot')).toBeInTheDocument()
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.com/shot.png')
    expect(container.textContent).toContain('Landscape preview cards')
    expect(container.textContent).toContain('side text')
  })

  it('missing image does not render a broken <img> element', () => {
    const input: SlideRenderInput = { config: baseConfig({ type: 'image-focus', title: 'No image here' }), bodyHtml: '<p>side text</p>' }
    const { container } = render(<ImageFocusLayout {...input} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('AC: notes are never rendered into any layout output (editor/preview-only per spec, not layout-visible)', () => {
  it('none of the 5 layouts render config.notes text into the DOM', () => {
    const notesText = 'SPEAKER-NOTES-SENTINEL-XYZ'
    const config = baseConfig({ type: 'content', title: 'T', notes: notesText })
    const input: SlideRenderInput = { config, bodyHtml: '<p>body</p>' }

    const r1 = render(<TitleLayout {...{ ...input, config: { ...config, type: 'title' } }} />)
    expect(r1.container.innerHTML).not.toContain(notesText)
    const r2 = render(<SectionLayout {...{ ...input, config: { ...config, type: 'section' } }} />)
    expect(r2.container.innerHTML).not.toContain(notesText)
    const r3 = render(<ContentLayout {...input} />)
    expect(r3.container.innerHTML).not.toContain(notesText)
    const r4 = render(<TwoColumnLayout {...{ ...input, columnsHtml: ['<p>l</p>', '<p>r</p>'] }} />)
    expect(r4.container.innerHTML).not.toContain(notesText)
    const r5 = render(<ImageFocusLayout {...{ ...input, config: { ...config, type: 'image-focus', image: 'https://x.com/a.png' } }} />)
    expect(r5.container.innerHTML).not.toContain(notesText)
  })
})
