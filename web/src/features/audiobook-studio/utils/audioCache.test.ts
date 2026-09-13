// Object URLs have exactly one owner: the element playing them.
//
// The audio cache used to hand out URLs and revoke them on eviction, while the
// audio element was still using one. That surfaces as a bare
// ERR_FILE_NOT_FOUND and silent playback — and it fired constantly during a
// conversion, because the cache is cleared after every narrated chapter.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const bookSource = readFileSync(join(__dirname, 'bookSource.ts'), 'utf8')
const hook = readFileSync(
  join(__dirname, '..', 'hooks', 'usePlaybackEngine.ts'),
  'utf8',
)

describe('object URL ownership', () => {
  it('does not create or revoke object URLs in the shared cache', () => {
    // The cache cannot know when a consumer is finished, so it must not own
    // the URL lifecycle at all.
    expect(bookSource).not.toContain('createObjectURL')
    expect(bookSource).not.toContain('revokeObjectURL')
  })

  it('creates and revokes the URL where the audio element lives', () => {
    expect(hook).toContain('URL.createObjectURL')
    expect(hook).toContain('URL.revokeObjectURL')
  })

  it('serves audio as blobs, which are safe to evict', () => {
    // Dropping a blob from the map cannot break anything: an object URL made
    // from it keeps it alive independently.
    expect(bookSource).toMatch(/audioCache = new Map<string, Blob>/)
    expect(bookSource).toMatch(/loadChapterAudio[\s\S]{0,200}Promise<Blob \| null>/)
  })
})
