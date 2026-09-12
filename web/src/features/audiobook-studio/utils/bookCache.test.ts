import { describe, it, expect } from 'vitest'
import { isCacheable } from './bookSource'
import type { BookRecord } from '../types'
import type { ReadableChapter } from './bookSource'

function book(patch: Partial<BookRecord> = {}): BookRecord {
  return {
    id: 'b1',
    title: 'Salt Roads',
    author: 'Unknown',
    language: 'en',
    sourceName: 'salt.epub',
    sourceType: 'epub',
    mode: 'narrated',
    voiceId: 'af_heart',
    status: 'narrating',
    chapterCount: 3,
    durationSec: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function chapter(timelineLength: number): ReadableChapter {
  return {
    index: 0,
    title: 'One',
    blocks: [{ type: 'p', text: 'Some prose.' }],
    sentences: [],
    timeline: Array.from({ length: timelineLength }, (_, i) => ({
      id: `s${i + 1}`,
      text: 'Some prose.',
      clipBegin: i,
      clipEnd: i + 1,
    })),
  }
}

describe('isCacheable', () => {
  it('refuses a narrated chapter that has no timings yet', () => {
    // This is the bug: cached here, the chapter can never gain its timings, and
    // playback becomes audio with dead text next to it.
    expect(isCacheable(book({ status: 'narrating' }), chapter(0))).toBe(false)
  })

  it('accepts a narrated chapter once its timings exist', () => {
    expect(isCacheable(book({ status: 'narrating' }), chapter(4))).toBe(true)
  })

  it('accepts a sealed chapter', () => {
    expect(isCacheable(book({ status: 'ready' }), chapter(4))).toBe(true)
  })

  it('accepts a live chapter, which never has timings by design', () => {
    expect(isCacheable(book({ mode: 'live', status: 'ready' }), chapter(0))).toBe(true)
  })
})
