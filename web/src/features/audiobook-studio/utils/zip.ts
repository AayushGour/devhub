// EPUB container read/write over fflate.
//
// The two rules that make a zip a valid EPUB, both enforced here:
//   1. `mimetype` is the FIRST entry in the archive
//   2. `mimetype` is STORED (level 0), never deflated
// Readers that check the magic bytes reject the file outright otherwise.

import { zip, unzip, strToU8, strFromU8, type Zippable, type Unzipped } from 'fflate'

export const EPUB_MIMETYPE = 'application/epub+zip'

/** No point deflating what is already compressed. */
const STORED = { level: 0 } as const

export interface SealInput {
  /** Path inside the zip -> text contents (XML, XHTML, CSS). */
  text: Record<string, string>
  /** Path inside the zip -> binary contents (MP3, images). */
  binary: Record<string, Uint8Array>
}

/**
 * Build the `.epub` archive.
 *
 * Key insertion order is the archive order, so `mimetype` is added first and
 * nothing may be inserted ahead of it.
 */
export function sealEpubBytes(input: SealInput): Promise<Uint8Array> {
  const files: Zippable = {}

  files['mimetype'] = [strToU8(EPUB_MIMETYPE), STORED]

  for (const [path, contents] of Object.entries(input.text)) {
    files[path] = strToU8(contents)
  }
  for (const [path, bytes] of Object.entries(input.binary)) {
    files[path] = [bytes, STORED]
  }

  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

/** Same archive as `sealEpubBytes`, wrapped for download or IndexedDB. */
export async function sealEpub(input: SealInput): Promise<Blob> {
  const bytes = await sealEpubBytes(input)
  return new Blob([bytes as unknown as BlobPart], { type: EPUB_MIMETYPE })
}

/**
 * Pull specific entries out of an archive without inflating the rest.
 *
 * This is what keeps a 200 MB narrated book off the heap: the reader asks for
 * one chapter's XHTML or MP3 at a time instead of hydrating the whole package.
 */
export function extractEntries(
  archive: Uint8Array,
  wanted: (path: string) => boolean,
): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(archive, { filter: (file) => wanted(file.name) }, (err, files) => {
      if (err) reject(err)
      else resolve(files)
    })
  })
}

/** Read one entry as UTF-8 text. Returns null when the entry is absent. */
export async function readTextEntry(
  archive: Uint8Array,
  path: string,
): Promise<string | null> {
  const files = await extractEntries(archive, (name) => name === path)
  const bytes = files[path]
  return bytes ? strFromU8(bytes) : null
}

/** Read one entry as raw bytes. Returns null when the entry is absent. */
export async function readBinaryEntry(
  archive: Uint8Array,
  path: string,
): Promise<Uint8Array | null> {
  const files = await extractEntries(archive, (name) => name === path)
  return files[path] ?? null
}

/** List every entry path in the archive, without inflating any of them. */
export function listEntries(archive: Uint8Array): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = []
    unzip(
      archive,
      {
        filter: (file) => {
          names.push(file.name)
          return false
        },
      },
      (err) => {
        if (err) reject(err)
        else resolve(names)
      },
    )
  })
}
