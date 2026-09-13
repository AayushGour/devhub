// How a sealed book is stored, and what happens to the ones stored the old way.
//
// The artifact used to be a Uint8Array, which IndexedDB deserialises in full on
// every read. It is a Blob now. Every library out there still has the old rows
// in it, and a book whose artifact will not read is a book the reader has lost,
// so the conversion is what these tests are mostly about.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installBlobArrayBuffer } from './testSupport'

installBlobArrayBuffer()

type Row = Record<string, unknown>

const stores = new Map<string, Map<string, Row>>()
/** Store names `upgrade` created during the open under test. */
const created: string[] = []
/** The version the database is opened *from*. 0 is a fresh install. */
let openedFrom = 0
/** Makes the next top-level `put` fail, standing in for a full disk. */
let failNextPut = false

function storeOf(name: string): Map<string, Row> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

function keyOf(value: Row): string {
  return (value.bookId ?? value.id ?? value.key) as string
}

function objectStore(name: string) {
  return {
    get: async (key: string) => storeOf(name).get(key),
    put: async (value: Row) => {
      storeOf(name).set(keyOf(value), value)
    },
    delete: async (key: string) => {
      storeOf(name).delete(key)
    },
  }
}

const fakeDb = {
  objectStoreNames: { contains: (name: string) => stores.has(name) },
  createObjectStore: (name: string) => {
    created.push(name)
    storeOf(name)
    return { createIndex: () => {} }
  },
  get: (name: string, key: string) => objectStore(name).get(key),
  getAll: async (name: string) => [...storeOf(name).values()],
  put: async (name: string, value: Row) => {
    if (failNextPut) {
      failNextPut = false
      throw new Error('QuotaExceededError')
    }
    await objectStore(name).put(value)
  },
  delete: (name: string, key: string) => objectStore(name).delete(key),
  getAllFromIndex: async () => [],
  getAllKeysFromIndex: async () => [],
  transaction: (names: string | string[]) => ({
    objectStore,
    store: objectStore(Array.isArray(names) ? names[0] : names),
    done: Promise.resolve(),
  }),
}

vi.mock('idb', () => ({
  openDB: async (
    _name: string,
    _version: number,
    options: { upgrade: (db: unknown, oldVersion: number) => void },
  ) => {
    options.upgrade(fakeDb, openedFrom)
    return fakeDb
  },
}))

const V1_STORES = ['books', 'artifacts', 'chapters', 'staging', 'progress', 'jobs', 'settings']

beforeEach(() => {
  stores.clear()
  created.length = 0
  openedFrom = 0
  failNextPut = false
  // db.ts memoises its connection at module scope, so every test needs its own
  // copy of the module to get its own open.
  vi.resetModules()
})

const EPUB = Uint8Array.from({ length: 512 }, (_, i) => (i * 13) % 251)

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Let every pending promise settle.
 *
 * The rewrite is deliberately fire-and-forget, so the read returns before it
 * has happened. A macrotask runs only once the microtask queue is empty, which
 * makes this a wait rather than a guess.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('schema upgrades', () => {
  it('creates every store on a fresh database', async () => {
    const db = await import('./db')
    await db.getArtifact('nobody')

    expect(created).toEqual([...V1_STORES, 'sources', 'outlines'])
  })

  it('adds the stores a v1 database is missing without touching the rest', async () => {
    openedFrom = 1
    V1_STORES.forEach(storeOf)

    const db = await import('./db')
    await db.getArtifact('nobody')

    // A database that skipped v2 has to come out of the upgrade complete, so
    // both later stores are created — not just the newest one.
    expect(created).toEqual(['sources', 'outlines'])
  })

  it('adds only outlines to a v2 database', async () => {
    openedFrom = 2
    ;[...V1_STORES, 'sources'].forEach(storeOf)

    const db = await import('./db')
    await db.getArtifact('nobody')

    expect(created).toEqual(['outlines'])
  })
})

describe('putArtifact', () => {
  it('stores the bytes it is handed as a blob', async () => {
    const db = await import('./db')
    await db.putArtifact('b1', EPUB)

    const row = storeOf('artifacts').get('b1')!
    expect(row.epub).toBeInstanceOf(Blob)
    expect(row.bytes).toBe(EPUB.byteLength)
    expect((row.epub as Blob).type).toBe('application/epub+zip')
    expect(await bytesOf(row.epub as Blob)).toEqual(EPUB)
  })

  it('drops the stored outline, which described the previous archive', async () => {
    const db = await import('./db')
    await db.putOutline('b1', [{ index: 0, title: 'Old', durationSec: 5, narrated: true }])

    // Re-sealing a book — after a re-extract, say — replaces the archive. An
    // outline naming the old chapters would survive and be served as this
    // book's contents.
    await db.putArtifact('b1', EPUB)

    expect(await db.getOutline('b1')).toBeUndefined()
  })
})

describe('getArtifact', () => {
  it('is undefined for a book that has none', async () => {
    const db = await import('./db')
    expect(await db.getArtifact('b1')).toBeUndefined()
  })

  it('reads back what it wrote', async () => {
    const db = await import('./db')
    await db.putArtifact('b1', EPUB)

    const artifact = await db.getArtifact('b1')
    expect(artifact!.epub).toBeInstanceOf(Blob)
    expect(await bytesOf(artifact!.epub)).toEqual(EPUB)
  })

  it('converts a v2 row and hands back a blob', async () => {
    storeOf('artifacts').set('b1', {
      bookId: 'b1',
      epub: EPUB,
      bytes: EPUB.byteLength,
      sealedAt: 111,
    })

    const db = await import('./db')
    const artifact = await db.getArtifact('b1')

    expect(artifact!.epub).toBeInstanceOf(Blob)
    expect(artifact!.sealedAt).toBe(111)
    expect(await bytesOf(artifact!.epub)).toEqual(EPUB)
  })

  it('rewrites a v2 row so the next read is cheap, exactly once', async () => {
    storeOf('artifacts').set('b1', {
      bookId: 'b1',
      epub: EPUB,
      bytes: EPUB.byteLength,
      sealedAt: 111,
    })

    const db = await import('./db')
    await db.getArtifact('b1')

    await flush()
    expect(storeOf('artifacts').get('b1')!.epub).toBeInstanceOf(Blob)
    expect(await bytesOf(storeOf('artifacts').get('b1')!.epub as Blob)).toEqual(EPUB)

    // Already a Blob, so a second read has nothing to convert.
    const putSpy = vi.spyOn(fakeDb, 'put')
    await db.getArtifact('b1')
    await flush()
    expect(putSpy).not.toHaveBeenCalled()
    putSpy.mockRestore()
  })

  it('still returns the book when the rewrite cannot be saved', async () => {
    storeOf('artifacts').set('b1', {
      bookId: 'b1',
      epub: EPUB,
      bytes: EPUB.byteLength,
      sealedAt: 111,
    })
    failNextPut = true

    const db = await import('./db')
    const artifact = await db.getArtifact('b1')

    // The read is what matters. A disk too full to hold the rewrite costs this
    // book one more deserialisation next time, and nothing else — the original
    // row is untouched and still readable.
    expect(await bytesOf(artifact!.epub)).toEqual(EPUB)
    await flush()
    expect(storeOf('artifacts').get('b1')!.epub).toBe(EPUB)
  })

  it('tries the rewrite again after a failure rather than giving up for good', async () => {
    storeOf('artifacts').set('b1', {
      bookId: 'b1',
      epub: EPUB,
      bytes: EPUB.byteLength,
      sealedAt: 111,
    })
    failNextPut = true

    const db = await import('./db')
    await db.getArtifact('b1')
    await flush()
    expect(storeOf('artifacts').get('b1')!.epub).toBe(EPUB)

    await db.getArtifact('b1')
    await flush()
    expect(storeOf('artifacts').get('b1')!.epub).toBeInstanceOf(Blob)
  })
})

describe('deleteArtifact', () => {
  it('takes the outline with it', async () => {
    const db = await import('./db')
    await db.putArtifact('b1', EPUB)
    await db.putOutline('b1', [{ index: 0, title: 'One', durationSec: 5, narrated: true }])

    await db.deleteArtifact('b1')

    expect(await db.getArtifact('b1')).toBeUndefined()
    expect(await db.getOutline('b1')).toBeUndefined()
  })
})
