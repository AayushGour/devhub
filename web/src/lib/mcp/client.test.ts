import { describe, it, expect } from 'vitest'
import { sseUrlCandidates } from './client'

describe('sseUrlCandidates', () => {
  it('tries the URL verbatim first when it already ends in /sse', () => {
    const candidates = sseUrlCandidates('https://example.com/api/sse')
    expect(candidates[0]).toBe('https://example.com/api/sse')
  })

  it('replaces the last path segment with /sse before other fallbacks', () => {
    const candidates = sseUrlCandidates('https://example.com/mcp')
    expect(candidates).toContain('https://example.com/sse')
    expect(candidates.indexOf('https://example.com/sse')).toBeLessThan(
      candidates.indexOf('https://example.com/mcp/sse'),
    )
  })

  it('includes root-level /sse and the original URL as-is', () => {
    const candidates = sseUrlCandidates('https://example.com/mcp')
    expect(candidates).toContain('https://example.com/sse')
    expect(candidates).toContain('https://example.com/mcp')
  })

  it('appends /sse to the full path as the last resort', () => {
    const candidates = sseUrlCandidates('https://example.com/mcp')
    expect(candidates[candidates.length - 1]).toBe('https://example.com/mcp/sse')
  })

  it('de-duplicates candidates', () => {
    const candidates = sseUrlCandidates('https://example.com/sse')
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('strips any existing query string from candidates', () => {
    const candidates = sseUrlCandidates('https://example.com/mcp?foo=bar')
    for (const c of candidates) expect(c).not.toContain('foo=bar')
  })

  it('appends ?access_token= to every candidate when a token is given', () => {
    const candidates = sseUrlCandidates('https://example.com/mcp', 'secret-token')
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c).toContain('access_token=secret-token')
    }
  })

  it('falls back to string manipulation for an unparseable URL', () => {
    const candidates = sseUrlCandidates('not a url')
    expect(candidates.length).toBeGreaterThan(0)
  })
})
