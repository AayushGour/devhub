import { describe, it, expect } from 'vitest'
import { parseSealedChapter } from './bookSource'

/** An overlay with one <par> per id, each two seconds long. */
function smilFor(textPath: string, ids: string[]): string {
  const pars = ids
    .map(
      (id, i) => `<par>
        <text src="${textPath}#${id}"/>
        <audio src="ch.mp3" clipBegin="0:00:0${i * 2}.000" clipEnd="0:00:0${i * 2 + 1}.500"/>
      </par>`,
    )
    .join('')
  return `<smil><body><seq>${pars}</seq></body></smil>`
}

describe('parseSealedChapter', () => {
  it('reads our own layout — one span per sentence', () => {
    const xhtml = `<html><body><section>
      <h1><span class="s" id="s1">Chapter One</span></h1>
      <p><span class="s" id="s2">First sentence.</span> <span class="s" id="s3">Second one.</span></p>
    </section></body></html>`

    const chapter = parseSealedChapter(0, xhtml, smilFor('ch.xhtml', ['s1', 's2', 's3']))

    expect(chapter.blocks).toEqual([
      { type: 'h1', text: 'Chapter One' },
      { type: 'p', text: 'First sentence. Second one.' },
    ])
    expect(chapter.sentences.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(chapter.sentences[1].blockIdx).toBe(1)
    expect(chapter.sentences[2].endsBlock).toBe(true)
    expect(chapter.timeline[2]).toMatchObject({ id: 's3', clipBegin: 4, clipEnd: 5.5 })
  })

  it('reads a foreign layout where the overlay points at whole paragraphs', () => {
    const xhtml = `<html><body>
      <h2 id="h-1">A Section</h2>
      <p id="p-1">A whole paragraph as one spoken phrase.</p>
    </body></html>`

    const chapter = parseSealedChapter(0, xhtml, smilFor('ch.xhtml', ['h-1', 'p-1']))

    expect(chapter.sentences.map((s) => s.id)).toEqual(['h-1', 'p-1'])
    expect(chapter.blocks[1]).toEqual({
      type: 'p',
      text: 'A whole paragraph as one spoken phrase.',
    })
    expect(chapter.timeline).toHaveLength(2)
  })

  it('renders unreferenced prose but gives it no timing', () => {
    const xhtml = `<html><body>
      <p id="p-1">Narrated.</p>
      <p>Not in the overlay at all.</p>
    </body></html>`

    const chapter = parseSealedChapter(0, xhtml, smilFor('ch.xhtml', ['p-1']))

    expect(chapter.blocks.map((b) => b.text)).toEqual([
      'Narrated.',
      'Not in the overlay at all.',
    ])
    expect(chapter.sentences).toHaveLength(1)
    expect(chapter.timeline).toHaveLength(1)
  })

  it('orders the timeline by the overlay, not by document position', () => {
    const xhtml = `<html><body>
      <p><span id="a">Alpha.</span> <span id="b">Bravo.</span></p>
    </body></html>`

    // The overlay plays them in reverse — the timeline must follow the audio.
    const chapter = parseSealedChapter(0, xhtml, smilFor('ch.xhtml', ['b', 'a']))
    expect(chapter.timeline.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('survives a chapter with no overlay at all', () => {
    const xhtml = '<html><body><p>Just text.</p></body></html>'
    const chapter = parseSealedChapter(0, xhtml, '')
    expect(chapter.blocks).toEqual([{ type: 'p', text: 'Just text.' }])
    expect(chapter.timeline).toHaveLength(0)
  })
})
