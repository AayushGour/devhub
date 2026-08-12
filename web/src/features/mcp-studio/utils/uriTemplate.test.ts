import { describe, it, expect } from 'vitest'
import { extractTemplateParams, expandUriTemplate } from './uriTemplate'

describe('extractTemplateParams', () => {
  it('extracts simple placeholders in order', () => {
    expect(extractTemplateParams('file:///logs/{date}/{level}.log')).toEqual(['date', 'level'])
  })

  it('strips a leading operator', () => {
    expect(extractTemplateParams('/search{?q}')).toEqual(['q'])
    expect(extractTemplateParams('{+path}/data')).toEqual(['path'])
  })

  it('splits a comma-separated variable list into separate params', () => {
    expect(extractTemplateParams('/search{?q,page,limit}')).toEqual(['q', 'page', 'limit'])
  })

  it('strips explode (*) and prefix (:N) modifiers from names', () => {
    expect(extractTemplateParams('{/list*}')).toEqual(['list'])
    expect(extractTemplateParams('{name:3}')).toEqual(['name'])
  })

  it('de-duplicates repeated names', () => {
    expect(extractTemplateParams('{a}/{a}/{b}')).toEqual(['a', 'b'])
  })

  it('does not throw on names containing regex metacharacters', () => {
    expect(() => extractTemplateParams('file:///{a[b}')).not.toThrow()
  })
})

describe('expandUriTemplate', () => {
  it('substitutes simple placeholders and URI-encodes values', () => {
    expect(expandUriTemplate('file:///logs/{date}.log', { date: '2026-07-23' })).toBe(
      'file:///logs/2026-07-23.log',
    )
    expect(expandUriTemplate('/x/{v}', { v: 'a b/c' })).toBe('/x/a%20b%2Fc')
  })

  it('does not crash on a param name with regex metacharacters', () => {
    // Regression: the old per-key `new RegExp(...{a[b}...)` threw SyntaxError.
    expect(() => expandUriTemplate('file:///{a[b}', { 'a[b': 'x' })).not.toThrow()
    expect(expandUriTemplate('file:///{a[b}', { 'a[b': 'x' })).toBe('file:///x')
  })

  it('expands a query operator with a named, &-joined list', () => {
    expect(expandUriTemplate('/search{?q,page}', { q: 'hi there', page: '2' })).toBe(
      '/search?q=hi%20there&page=2',
    )
  })

  it('omits variables with no value', () => {
    expect(expandUriTemplate('/search{?q,page}', { q: 'x' })).toBe('/search?q=x')
    expect(expandUriTemplate('/{a}/{b}', { a: '1' })).toBe('/1/')
  })

  it('leaves reserved characters unencoded under the + operator', () => {
    expect(expandUriTemplate('{+path}/here', { path: '/foo/bar' })).toBe('/foo/bar/here')
  })

  it('uses the label separator for the . operator', () => {
    expect(expandUriTemplate('file{.ext}', { ext: 'txt' })).toBe('file.txt')
  })
})
