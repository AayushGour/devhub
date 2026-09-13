// EPUB container read/write over fflate.
//
// The two rules that make a zip a valid EPUB, both enforced here:
//   1. `mimetype` is the FIRST entry in the archive
//   2. `mimetype` is STORED (level 0), never deflated
// Readers that check the magic bytes reject the file outright otherwise.
//
// Reading comes in two flavours, and the difference matters at a few hundred
// megabytes. The `*Entry` helpers take the archive as bytes, so the caller is
// already holding all of it — right for a file that was just uploaded. The
// `ZipIndex` helpers at the bottom take a Blob and read one entry out of it at
// a time; that is the path a stored book uses, and the only one that never
// puts the whole publication on the heap.

import { zip, unzip, inflateSync, strToU8, strFromU8, type Zippable, type Unzipped } from 'fflate'

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
 * Skipping the inflation of unwanted entries is only half the cost: the caller
 * still holds every byte of `archive`, so this does NOT keep a 200 MB book off
 * the heap. It is for an archive that is in hand anyway — a file the reader
 * just picked. Reading a *stored* book one entry at a time, without ever
 * materialising it, is what `readZipIndex` + `readZipEntry` below are for.
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

// ── random access over a stored archive ───────────────────────────
//
// A zip keeps its table of contents (the "central directory") at the end of the
// file, and every listing names the offset of that entry's bytes. So given
// random access to the file — which a Blob gives — any single entry can be read
// with two small slices, no matter how big the archive is. That is what lets a
// 216 MB book be opened, paged through and played without ever being
// deserialised onto the heap.

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const SIG_ZIP64_LOCATOR = 0x07064b50
const SIG_ZIP64_EOCD = 0x06064b50

/** A 32-bit size/offset field pegged to this means "see the zip64 extra". */
const U32_MAX = 0xffffffff

export interface ZipEntry {
  name: string
  /** 0 = stored, 8 = deflate. Nothing else is defined for an EPUB. */
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

/** Entry path -> where its bytes live. Parsed once, sliced many times. */
export type ZipIndex = ReadonlyMap<string, ZipEntry>

async function sliceBytes(source: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await source.slice(start, end).arrayBuffer())
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function readU64(view: DataView, at: number): number {
  const value = view.getBigUint64(at, true)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('zip entry is too large to address')
  }
  return Number(value)
}

/**
 * Read an archive's central directory.
 *
 * Two small reads regardless of archive size. Callers are expected to hold on
 * to the result for as long as they hold the Blob — re-parsing it per entry
 * would turn every chapter turn back into a scan of the whole directory.
 */
export async function readZipIndex(source: Blob): Promise<ZipIndex> {
  // The end-of-central-directory record is last, except that a trailing comment
  // of up to 64 KB may follow it, so the tail is searched backwards for it.
  const tailSize = Math.min(source.size, 0xffff + 22)
  const tail = await sliceBytes(source, source.size - tailSize, source.size)
  const tailView = viewOf(tail)

  let eocd = -1
  for (let at = tail.byteLength - 22; at >= 0; at--) {
    if (tailView.getUint32(at, true) === SIG_EOCD) {
      eocd = at
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip archive — no end-of-central-directory record')

  let entryCount = tailView.getUint16(eocd + 10, true)
  let directorySize = tailView.getUint32(eocd + 12, true)
  let directoryAt = tailView.getUint32(eocd + 16, true)

  // Zip64: the 32-bit fields are pegged and the real ones live in a second
  // record pointed at by a locator sitting immediately before the EOCD.
  if (entryCount === 0xffff || directorySize === U32_MAX || directoryAt === U32_MAX) {
    if (eocd >= 20 && tailView.getUint32(eocd - 20, true) === SIG_ZIP64_LOCATOR) {
      const recordAt = readU64(tailView, eocd - 12)
      const record = await sliceBytes(source, recordAt, recordAt + 56)
      const view = viewOf(record)
      if (record.byteLength >= 56 && view.getUint32(0, true) === SIG_ZIP64_EOCD) {
        entryCount = readU64(view, 32)
        directorySize = readU64(view, 40)
        directoryAt = readU64(view, 48)
      }
    }
  }

  const directory = await sliceBytes(source, directoryAt, directoryAt + directorySize)
  const view = viewOf(directory)
  // fflate writes UTF-8 names and flags them as such; anything else in the wild
  // is ASCII in practice, which decodes identically.
  const decoder = new TextDecoder()
  const entries = new Map<string, ZipEntry>()

  let at = 0
  for (let i = 0; i < entryCount && at + 46 <= directory.byteLength; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break

    const method = view.getUint16(at + 10, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)

    let compressedSize = view.getUint32(at + 20, true)
    let uncompressedSize = view.getUint32(at + 24, true)
    let localHeaderOffset = view.getUint32(at + 42, true)

    const name = decoder.decode(directory.subarray(at + 46, at + 46 + nameLength))

    if (
      compressedSize === U32_MAX ||
      uncompressedSize === U32_MAX ||
      localHeaderOffset === U32_MAX
    ) {
      // The zip64 extra field repeats only the pegged values, and always in the
      // order uncompressed, compressed, offset — so which ones are present has
      // to be inferred from which ones were pegged.
      let field = at + 46 + nameLength
      const extraEnd = field + extraLength
      while (field + 4 <= extraEnd) {
        const id = view.getUint16(field, true)
        const size = view.getUint16(field + 2, true)
        if (id === 0x0001) {
          let value = field + 4
          if (uncompressedSize === U32_MAX) {
            uncompressedSize = readU64(view, value)
            value += 8
          }
          if (compressedSize === U32_MAX) {
            compressedSize = readU64(view, value)
            value += 8
          }
          if (localHeaderOffset === U32_MAX) localHeaderOffset = readU64(view, value)
          break
        }
        field += 4 + size
      }
    }

    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset })
    at += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Where an entry's compressed bytes begin, past its local header. */
async function dataOffset(source: Blob, entry: ZipEntry): Promise<number> {
  const header = await sliceBytes(source, entry.localHeaderOffset, entry.localHeaderOffset + 30)
  const view = viewOf(header)
  if (header.byteLength < 30 || view.getUint32(0, true) !== SIG_LOCAL) {
    throw new Error(`corrupt archive — no local header for ${entry.name}`)
  }
  // The local header's own name and extra lengths, never the directory's: a
  // writer is free to pad the two differently, and using the wrong pair lands
  // the read in the middle of the header.
  return entry.localHeaderOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true)
}

/**
 * One entry's bytes, read straight out of the stored archive.
 *
 * Only this entry is ever allocated. Inflation is synchronous, which is what we
 * want here: the entries that go through it are the small text documents, while
 * the big ones — the MP3s — are STORED and come back as a plain copy, or better
 * still as a `sliceStoredEntry` handle that is never copied at all.
 */
export async function readZipEntry(
  source: Blob,
  index: ZipIndex,
  path: string,
): Promise<Uint8Array | null> {
  const entry = index.get(path)
  if (!entry) return null

  const start = await dataOffset(source, entry)
  const raw = await sliceBytes(source, start, start + entry.compressedSize)

  if (entry.method === 0) return raw
  if (entry.method !== 8) {
    throw new Error(`unsupported compression method ${entry.method} for ${path}`)
  }
  // A pre-sized output buffer skips fflate's grow-and-copy. Size 0 means the
  // writer streamed the entry and left the size in a data descriptor.
  return entry.uncompressedSize > 0
    ? inflateSync(raw, { out: new Uint8Array(entry.uncompressedSize) })
    : inflateSync(raw)
}

/** One entry as UTF-8 text. Null when the entry is absent. */
export async function readZipText(
  source: Blob,
  index: ZipIndex,
  path: string,
): Promise<string | null> {
  const bytes = await readZipEntry(source, index, path)
  return bytes ? strFromU8(bytes) : null
}

/**
 * A STORED entry as a Blob slice — a handle into the archive, not a copy.
 *
 * The cheapest read there is: a chapter's audio never reaches the heap at all,
 * it is played straight out of the file IndexedDB is holding. Returns null when
 * the entry is missing or deflated; a deflated entry has to be inflated, which
 * means `readZipEntry`.
 */
export async function sliceStoredEntry(
  source: Blob,
  index: ZipIndex,
  path: string,
  type: string,
): Promise<Blob | null> {
  const entry = index.get(path)
  if (!entry || entry.method !== 0) return null

  const start = await dataOffset(source, entry)
  return source.slice(start, start + entry.compressedSize, type)
}
