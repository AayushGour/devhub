import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { formatInline } from './guideInlineFormat'

afterEach(cleanup)

describe('formatInline', () => {
  it('renders plain text with no markup unchanged', () => {
    const { container } = render(<>{formatInline('just plain text')}</>)
    expect(container.textContent).toBe('just plain text')
    expect(container.querySelector('code')).toBeNull()
    expect(container.querySelector('strong')).toBeNull()
  })

  it('renders a single `code` span as a <code> element', () => {
    const { container } = render(<>{formatInline('use `type: deck` here')}</>)
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe('type: deck')
    expect(container.textContent).toBe('use type: deck here')
  })

  it('renders **bold** as a <strong> element', () => {
    const { container } = render(<>{formatInline('this is **important**')}</>)
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe('important')
  })

  it('handles multiple code spans and bold in one string', () => {
    const { container } = render(<>{formatInline('`a` and `b` are **both** here')}</>)
    const codes = container.querySelectorAll('code')
    expect(codes).toHaveLength(2)
    expect(codes[0].textContent).toBe('a')
    expect(codes[1].textContent).toBe('b')
    expect(container.querySelector('strong')?.textContent).toBe('both')
    expect(container.textContent).toBe('a and b are both here')
  })

  it('handles markup at the very start and end of the string with no surrounding text', () => {
    const { container } = render(<>{formatInline('`start` middle `end`')}</>)
    const codes = container.querySelectorAll('code')
    expect(codes[0].textContent).toBe('start')
    expect(codes[1].textContent).toBe('end')
  })
})
