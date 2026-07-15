import { describe, it, expect } from 'vitest'
import { measureAndScale, OVERFLOW_SCALE_FLOOR } from './slideOverflow'

function stubHeight(el: HTMLElement, height: number) {
  Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true })
}

describe('measureAndScale', () => {
  it('returns scale 1, not clipped when content fits the box', () => {
    const el = document.createElement('div')
    stubHeight(el, 400)
    const result = measureAndScale(el, 500)
    expect(result).toEqual({ scale: 1, clipped: false })
  })

  it('returns scale 1 when content exactly equals box height', () => {
    const el = document.createElement('div')
    stubHeight(el, 500)
    const result = measureAndScale(el, 500)
    expect(result).toEqual({ scale: 1, clipped: false })
  })

  it('scales down proportionally when content overflows but stays above the floor', () => {
    const el = document.createElement('div')
    stubHeight(el, 600) // box 500 / content 600 = 0.833..., above floor
    const result = measureAndScale(el, 500)
    expect(result.clipped).toBe(false)
    expect(result.scale).toBeCloseTo(500 / 600, 5)
    expect(result.scale).toBeGreaterThan(OVERFLOW_SCALE_FLOOR)
  })

  it('floors the scale and clips when fitted scale would go below the floor', () => {
    const el = document.createElement('div')
    stubHeight(el, 2000) // box 500 / content 2000 = 0.25, well below 0.6 floor
    const result = measureAndScale(el, 500)
    expect(result.scale).toBe(OVERFLOW_SCALE_FLOOR)
    expect(result.clipped).toBe(true)
  })

  it('is exactly at the floor boundary -> not clipped (floor itself still fits)', () => {
    // fitted = boxHeight / contentHeight === OVERFLOW_SCALE_FLOOR exactly
    const boxHeight = 600
    const contentHeight = boxHeight / OVERFLOW_SCALE_FLOOR
    const el = document.createElement('div')
    stubHeight(el, contentHeight)
    const result = measureAndScale(el, boxHeight)
    expect(result.scale).toBeCloseTo(OVERFLOW_SCALE_FLOOR, 5)
    expect(result.clipped).toBe(false)
  })

  it('just below the floor boundary -> floors and clips', () => {
    const boxHeight = 600
    const contentHeight = boxHeight / (OVERFLOW_SCALE_FLOOR - 0.01)
    const el = document.createElement('div')
    stubHeight(el, contentHeight)
    const result = measureAndScale(el, boxHeight)
    expect(result.scale).toBe(OVERFLOW_SCALE_FLOOR)
    expect(result.clipped).toBe(true)
  })

  it('handles zero/missing height gracefully without throwing', () => {
    const el = document.createElement('div')
    stubHeight(el, 0)
    expect(() => measureAndScale(el, 500)).not.toThrow()
    expect(measureAndScale(el, 500)).toEqual({ scale: 1, clipped: false })
  })
})
