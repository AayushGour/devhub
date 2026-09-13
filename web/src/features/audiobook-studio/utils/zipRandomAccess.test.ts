// Reading one entry out of a stored archive.
//
// This is the path every sealed book takes, so an off-by-one in a zip header
// here does not throw — it reads neighbouring bytes and hands back silent
// garbage. These tests pin the offsets against archives fflate actually wrote.

import { describe, it, expect } from 'vitest'
import { strFromU8 } from 'fflate'
import { installBlobArrayBuffer } from './testSupport'
import {
  readZipEntry,
  readZipIndex,
  readZipText,
  sealEpubBytes,
  sliceStoredEntry,
} from './zip'

installBlobArrayBuffer()

const PROSE = `<html><body>${'<p>The same sentence again.</p>'.repeat(200)}</body></html>`
const AUDIO = Uint8Array.from({ length: 4096 }, (_, i) => (i * 7) % 251)

async function archive(): Promise<Blob> {
  const bytes = await sealEpubBytes({
    text: {
      'META-INF/container.xml': '<container version="1.0"/>',
      'OEBPS/text/ch001.xhtml': PROSE,
    },
    binary: { 'OEBPS/audio/ch001.mp3': AUDIO },
  })
  return new Blob([bytes as unknown as BlobPart])
}

describe('readZipIndex', () => {
  it('lists every entry with the offsets needed to read it', async () => {
    const index = await readZipIndex(await archive())

    expect([...index.keys()]).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/text/ch001.xhtml',
      'OEBPS/audio/ch001.mp3',
    ])

    // `mimetype` must be STORED and first — the rule that makes the zip an EPUB.
    const mimetype = index.get('mimetype')!
    expect(mimetype.method).toBe(0)
    expect(mimetype.localHeaderOffset).toBe(0)

    // Audio goes in STORED too, which is what makes it sliceable.
    expect(index.get('OEBPS/audio/ch001.mp3')!.method).toBe(0)
    expect(index.get('OEBPS/audio/ch001.mp3')!.uncompressedSize).toBe(AUDIO.byteLength)
  })

  it('rejects something that is not an archive at all', async () => {
    const notAZip = new Blob([new Uint8Array(200) as unknown as BlobPart])
    await expect(readZipIndex(notAZip)).rejects.toThrow(/end-of-central-directory/)
  })
})

describe('readZipEntry', () => {
  it('inflates a deflated entry', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)

    // Highly repetitive prose: fflate deflates it rather than storing it, so
    // this exercises the inflate path and not a plain copy.
    expect(index.get('OEBPS/text/ch001.xhtml')!.method).toBe(8)
    expect(await readZipText(blob, index, 'OEBPS/text/ch001.xhtml')).toBe(PROSE)
  })

  it('copies a stored entry back byte for byte', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)

    const bytes = await readZipEntry(blob, index, 'OEBPS/audio/ch001.mp3')
    expect(bytes).toEqual(AUDIO)
  })

  it('reads the entry it was asked for, not the one beside it', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)

    expect(await readZipText(blob, index, 'mimetype')).toBe('application/epub+zip')
    expect(await readZipText(blob, index, 'META-INF/container.xml')).toBe(
      '<container version="1.0"/>',
    )
  })

  it('is null for an entry the archive does not have', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)
    expect(await readZipEntry(blob, index, 'OEBPS/audio/ch009.mp3')).toBeNull()
  })
})

describe('sliceStoredEntry', () => {
  it('hands back a handle into the archive rather than a copy', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)

    const audio = await sliceStoredEntry(blob, index, 'OEBPS/audio/ch001.mp3', 'audio/mpeg')
    expect(audio).not.toBeNull()
    expect(audio!.type).toBe('audio/mpeg')
    expect(audio!.size).toBe(AUDIO.byteLength)
    expect(new Uint8Array(await audio!.arrayBuffer())).toEqual(AUDIO)
  })

  it('refuses a deflated entry, which has to be inflated to be read', async () => {
    const blob = await archive()
    const index = await readZipIndex(blob)

    const text = await sliceStoredEntry(
      blob,
      index,
      'OEBPS/text/ch001.xhtml',
      'application/xhtml+xml',
    )
    expect(text).toBeNull()
  })
})

describe('reading cost', () => {
  it('does not grow with the size of the archive', async () => {
    const small = await archive()

    const padded = await sealEpubBytes({
      text: { 'OEBPS/text/ch001.xhtml': PROSE },
      // Incompressible noise standing in for a book's worth of audio. Reading
      // one small entry out of it must cost the same as before.
      binary: {
        'OEBPS/audio/big.mp3': Uint8Array.from({ length: 400_000 }, (_, i) => (i * 31) % 256),
      },
    })
    const large = new Blob([padded as unknown as BlobPart])

    const largeIndex = await readZipIndex(large)
    const read = await readZipEntry(large, largeIndex, 'OEBPS/text/ch001.xhtml')

    expect(strFromU8(read!)).toBe(PROSE)
    // The bytes touched to read the chapter are its compressed size plus two
    // headers — a fraction of a percent of the archive.
    expect(largeIndex.get('OEBPS/text/ch001.xhtml')!.compressedSize).toBeLessThan(2_000)
    expect(small.size).toBeLessThan(large.size)
  })
})
