import { describe, it, expect } from 'vitest'
import { formatBytes, formatLength, formatTime } from './format'

describe('formatTime', () => {
  it('drops the hours field below an hour', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3599)).toBe('59:59')
  })

  it('pads minutes and seconds once hours appear', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3849)).toBe('1:04:09')
  })

  it('refuses to render a position that is not a number', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
    expect(formatTime(-1)).toBe('0:00')
  })
})

describe('formatLength', () => {
  it('reports seconds below a minute', () => {
    expect(formatLength(0)).toBe('0s')
    expect(formatLength(5)).toBe('5s')
    expect(formatLength(59)).toBe('59s')
    expect(formatLength(59.4)).toBe('59s')
  })

  it('tips into minutes rather than printing a sixtieth second', () => {
    expect(formatLength(59.6)).toBe('1m')
    expect(formatLength(60)).toBe('1m')
  })

  it('reports minutes below an hour', () => {
    expect(formatLength(600)).toBe('10m')
    expect(formatLength(3540)).toBe('59m')
  })

  it('tips into hours rather than printing a sixtieth minute', () => {
    expect(formatLength(3570)).toBe('1h 0m')
    expect(formatLength(3600)).toBe('1h 0m')
  })

  it('reports hours and the remaining minutes', () => {
    expect(formatLength(8040)).toBe('2h 14m')
    expect(formatLength(36000)).toBe('10h 0m')
  })

  // A book still being narrated has no duration, and the arithmetic that
  // produces one can divide by zero.
  it('refuses to render a length that is not a number', () => {
    expect(formatLength(NaN)).toBe('0s')
    expect(formatLength(Infinity)).toBe('0s')
    expect(formatLength(-Infinity)).toBe('0s')
    expect(formatLength(-30)).toBe('0s')
  })
})

describe('formatBytes', () => {
  it('picks the unit from the magnitude', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB')
  })
})
