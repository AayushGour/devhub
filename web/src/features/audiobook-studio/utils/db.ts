// IndexedDB access for Audiobook Studio.
//
// Eight stores with two distinct lifetimes:
//   permanent  books, sources, artifacts, outlines, progress, settings
//   staging    chapters, staging, jobs — dropped when a book is sealed
//
// Follows the `idb` wrapper pattern used by rag-studio's vectorDb.ts: one
// module-level connection promise, opened lazily.

import { openDB, type IDBPDatabase, type DBSchema } from 'idb'
import { createLogger } from '@/lib/logger'
import {
  DEFAULT_SETTINGS,
  type BookRecord,
  type BookStatus,
  type ChapterRecord,
  type JobRecord,
  type ProgressRecord,
  type SettingsRecord,
  type StagingKind,
  type StagingRecord,
} from '../types'

const log = createLogger('audiobook:db')

const DB_NAME = 'audiobook-studio'
const DB_VERSION = 3

/**
 * The file a book was made from.
 *
 * Kept so a book can be extracted again — a parser improvement is worth
 * nothing if re-reading the book means finding the original file by hand. It
 * costs the source's own size on top of the audio, which is why it is a store
 * of its own and not part of the book record: listing the library must not drag
 * a hundred megabytes of PDF through memory.
 */
export interface SourceRecord {
  bookId: string
  name: string
  bytes: Uint8Array
}

/**
 * The sealed publication. Kept out of `books` so listing the library is cheap.
 *
 * `epub` is a Blob and not a Uint8Array, and that is the whole point of this
 * record. IndexedDB deserialises a typed array in full on every read, so a
 * 216 MB book was allocated again for every chapter turn — which defeated the
 * one-entry-at-a-time reading the reader was built around. A Blob comes back as
 * a handle to the stored file: reading the record costs nothing, and the reader
 * slices out only the entry it wants.
 */
export interface ArtifactRecord {
  bookId: string
  epub: Blob
  bytes: number
  sealedAt: number
}

/**
 * What v2 wrote. Rows in this shape are still on disk in every existing
 * library, so a read has to cope with either — see `getArtifact`.
 */
type StoredArtifact = Omit<ArtifactRecord, 'epub'> & { epub: Blob | Uint8Array | ArrayBuffer }

/**
 * A sealed book's chapter list, so opening it does not mean reading the
 * publication apart to find out what is in it.
 *
 * Structurally the `ChapterOutline` that bookSource hands back; that module
 * owns the shape and this store is only where it is parked. Derived data with
 * exactly the artifact's lifetime — `putArtifact` drops it, because a re-sealed
 * book is a different book with the same id.
 */
export interface OutlineRecord {
  bookId: string
  chapters: { index: number; title: string; durationSec: number; narrated: boolean }[]
  builtAt: number
}

interface AudiobookDB extends DBSchema {
  books: { key: string; value: BookRecord }
  sources: { key: string; value: SourceRecord }
  artifacts: { key: string; value: StoredArtifact }
  outlines: { key: string; value: OutlineRecord }
  chapters: { key: string; value: ChapterRecord; indexes: { by_book: string } }
  staging: { key: string; value: StagingRecord; indexes: { by_book: string } }
  progress: { key: string; value: ProgressRecord }
  jobs: { key: string; value: JobRecord }
  settings: { key: string; value: SettingsRecord }
}

let _db: Promise<IDBPDatabase<AudiobookDB>> | null = null

function getDB(): Promise<IDBPDatabase<AudiobookDB>> {
  if (_db) return _db
  _db = openDB<AudiobookDB>(DB_NAME, DB_VERSION, {
    // Every step is additive, and deliberately so. A versionchange transaction
    // blocks the whole origin and cannot be resumed if the tab goes away, so
    // rewriting hundreds of megabytes of artifact in here would risk leaving a
    // library half-migrated and unopenable. Data that has to change shape is
    // converted where it is read instead — see `getArtifact`.
    //
    // Each step is guarded by name rather than by version alone so a database
    // that skipped a version (v1 straight to v3) still ends up complete.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('books', { keyPath: 'id' })
        db.createObjectStore('artifacts', { keyPath: 'bookId' })

        const chapters = db.createObjectStore('chapters', { keyPath: 'key' })
        chapters.createIndex('by_book', 'bookId')

        const staging = db.createObjectStore('staging', { keyPath: 'key' })
        staging.createIndex('by_book', 'bookId')

        db.createObjectStore('progress', { keyPath: 'bookId' })
        db.createObjectStore('jobs', { keyPath: 'bookId' })
        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // Version 2 adds `sources`. Existing books simply have no entry, and the
      // reader is asked for the file when one of them is extracted again.
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'bookId' })
      }

      // Version 3 adds `outlines`. Existing books simply have no entry, and the
      // first open of one builds and stores it.
      if (!db.objectStoreNames.contains('outlines')) {
        db.createObjectStore('outlines', { keyPath: 'bookId' })
      }
    },
  })
  return _db
}

export function chapterKey(bookId: string, index: number): string {
  return `${bookId}:${index}`
}

export function stagingKey(bookId: string, kind: StagingKind, index: number): string {
  return `${bookId}:${kind}:${index}`
}

// ── books ─────────────────────────────────────────────────────────

export async function listBooks(): Promise<BookRecord[]> {
  const db = await getDB()
  const books = await db.getAll('books')
  return books.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  return (await getDB()).get('books', id)
}

export async function putBook(book: BookRecord): Promise<void> {
  await (await getDB()).put('books', { ...book, updatedAt: Date.now() })
}

/** Shallow-merge a patch into a book. No-ops if the book is gone. */
export async function patchBook(
  id: string,
  patch: Partial<BookRecord>,
): Promise<BookRecord | undefined> {
  const db = await getDB()
  const tx = db.transaction('books', 'readwrite')
  const existing = await tx.store.get(id)
  if (!existing) {
    await tx.done
    return undefined
  }
  const next = { ...existing, ...patch, updatedAt: Date.now() }
  await tx.store.put(next)
  await tx.done
  return next
}

export async function setBookStatus(
  id: string,
  status: BookStatus,
  error?: string,
): Promise<void> {
  await patchBook(id, { status, error })
}

/** Remove a book and everything attached to it. */
export async function deleteBook(id: string): Promise<void> {
  const db = await getDB()
  await Promise.all([
    db.delete('books', id),
    db.delete('artifacts', id),
    db.delete('outlines', id),
    db.delete('sources', id),
    db.delete('progress', id),
    db.delete('jobs', id),
    clearStaging(id),
  ])
  log.log(`deleted book ${id}`)
}

// ── artifacts ─────────────────────────────────────────────────────

export const EPUB_MIME = 'application/epub+zip'

/**
 * Store a sealed publication.
 *
 * Takes bytes because that is what sealing produces; the conversion never has
 * to know that storage is blob-shaped. The outline goes with it: a re-seal
 * replaces the archive, and an outline describing the previous one would
 * survive to name chapters that are no longer there.
 */
export async function putArtifact(bookId: string, epub: Uint8Array): Promise<void> {
  const record: ArtifactRecord = {
    bookId,
    epub: new Blob([epub as unknown as BlobPart], { type: EPUB_MIME }),
    bytes: epub.byteLength,
    sealedAt: Date.now(),
  }

  const db = await getDB()
  const tx = db.transaction(['artifacts', 'outlines'], 'readwrite')
  await Promise.all([
    tx.objectStore('artifacts').put(record),
    tx.objectStore('outlines').delete(bookId),
    tx.done,
  ])
}

/** Books whose v2 row this session has already tried to rewrite as a Blob. */
const rewritten = new Set<string>()

/**
 * Rewrite a migrated record, once per book per session.
 *
 * Best-effort on purpose. The read that triggered it already has its Blob, and
 * a failed `put` leaves the v2 row untouched — so a full disk costs the book
 * one more deserialisation, never the book itself.
 */
function rewriteAsBlob(record: ArtifactRecord): void {
  if (rewritten.has(record.bookId)) return
  rewritten.add(record.bookId)

  void getDB()
    .then((db) => db.put('artifacts', record))
    .then(() => log.log(`artifact ${record.bookId} migrated to blob storage`))
    .catch((error) => {
      rewritten.delete(record.bookId)
      log.warn(`artifact ${record.bookId} could not be migrated to blob storage`, error)
    })
}

/**
 * The sealed publication, always Blob-backed.
 *
 * v2 wrote `epub` as a Uint8Array. Those rows are converted here rather than in
 * the upgrade transaction, so a library full of them opens instantly and pays
 * for each book only when that book is first read — and a book that cannot be
 * rewritten is still returned, because losing it is far worse than paying the
 * old cost again.
 */
export async function getArtifact(bookId: string): Promise<ArtifactRecord | undefined> {
  const stored = await (await getDB()).get('artifacts', bookId)
  if (!stored) return undefined
  if (stored.epub instanceof Blob) return stored as ArtifactRecord

  const migrated: ArtifactRecord = {
    ...stored,
    epub: new Blob([stored.epub as unknown as BlobPart], { type: EPUB_MIME }),
  }
  rewriteAsBlob(migrated)
  return migrated
}

export async function deleteArtifact(bookId: string): Promise<void> {
  const db = await getDB()
  await Promise.all([db.delete('artifacts', bookId), db.delete('outlines', bookId)])
}

// ── outlines ──────────────────────────────────────────────────────

export async function getOutline(bookId: string): Promise<OutlineRecord | undefined> {
  return (await getDB()).get('outlines', bookId)
}

export async function putOutline(
  bookId: string,
  chapters: OutlineRecord['chapters'],
): Promise<void> {
  await (await getDB()).put('outlines', { bookId, chapters, builtAt: Date.now() })
}

// ── sources ───────────────────────────────────────────────────────

export async function putSource(bookId: string, name: string, bytes: Uint8Array): Promise<void> {
  await (await getDB()).put('sources', { bookId, name, bytes })
}

export async function getSource(bookId: string): Promise<SourceRecord | undefined> {
  return (await getDB()).get('sources', bookId)
}

// ── chapters ──────────────────────────────────────────────────────

export async function putChapter(chapter: ChapterRecord): Promise<void> {
  await (await getDB()).put('chapters', chapter)
}

export async function getChapter(
  bookId: string,
  index: number,
): Promise<ChapterRecord | undefined> {
  return (await getDB()).get('chapters', chapterKey(bookId, index))
}

export async function listChapters(bookId: string): Promise<ChapterRecord[]> {
  const db = await getDB()
  const chapters = await db.getAllFromIndex('chapters', 'by_book', bookId)
  return chapters.sort((a, b) => a.index - b.index)
}

// ── staging ───────────────────────────────────────────────────────

export async function putStaging(record: StagingRecord): Promise<void> {
  await (await getDB()).put('staging', record)
}

export async function getStaging(
  bookId: string,
  kind: StagingKind,
  index: number,
): Promise<StagingRecord | undefined> {
  return (await getDB()).get('staging', stagingKey(bookId, kind, index))
}

export async function listStaging(bookId: string): Promise<StagingRecord[]> {
  return (await getDB()).getAllFromIndex('staging', 'by_book', bookId)
}

/**
 * Drop every staging row for a book. Called after sealing — from that point the
 * zip is the only copy, so this must never run before the artifact is stored.
 */
export async function clearStaging(bookId: string): Promise<void> {
  const db = await getDB()

  const stagingKeys = await db.getAllKeysFromIndex('staging', 'by_book', bookId)
  const chapterKeys = await db.getAllKeysFromIndex('chapters', 'by_book', bookId)

  const tx = db.transaction(['staging', 'chapters'], 'readwrite')
  await Promise.all([
    ...stagingKeys.map((key) => tx.objectStore('staging').delete(key)),
    ...chapterKeys.map((key) => tx.objectStore('chapters').delete(key)),
    tx.done,
  ])
}

// ── progress ──────────────────────────────────────────────────────

export async function deleteProgress(bookId: string): Promise<void> {
  await (await getDB()).delete('progress', bookId)
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return (await getDB()).get('progress', bookId)
}

export async function putProgress(progress: Omit<ProgressRecord, 'updatedAt'>): Promise<void> {
  await (await getDB()).put('progress', { ...progress, updatedAt: Date.now() })
}

// ── jobs ──────────────────────────────────────────────────────────

export async function getJob(bookId: string): Promise<JobRecord | undefined> {
  return (await getDB()).get('jobs', bookId)
}

export async function putJob(job: Omit<JobRecord, 'updatedAt'>): Promise<void> {
  await (await getDB()).put('jobs', { ...job, updatedAt: Date.now() })
}

export async function deleteJob(bookId: string): Promise<void> {
  await (await getDB()).delete('jobs', bookId)
}

/** Jobs left mid-flight by a closed tab or a crash. */
export async function listResumableJobs(): Promise<JobRecord[]> {
  const db = await getDB()
  const jobs = await db.getAll('jobs')
  return jobs.filter((job) => job.stage === 'narrate' || job.stage === 'seal')
}

// ── settings ──────────────────────────────────────────────────────

export async function getSettings(): Promise<SettingsRecord> {
  const stored = await (await getDB()).get('settings', 'default')
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS
}

export async function putSettings(patch: Partial<SettingsRecord>): Promise<SettingsRecord> {
  const next = { ...(await getSettings()), ...patch, key: 'default' as const }
  await (await getDB()).put('settings', next)
  return next
}

// ── quota ─────────────────────────────────────────────────────────

export interface QuotaEstimate {
  usage: number
  quota: number
  available: number
  persisted: boolean
}

/**
 * Ask for persistent storage and report the budget.
 *
 * Worth doing before a multi-hundred-megabyte conversion: without persistence
 * the browser may evict the whole origin under pressure, and an incognito
 * session caps hard at roughly 2 GB regardless of free disk.
 */
export async function estimateQuota(): Promise<QuotaEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, available: 0, persisted: false }
  }

  const { usage = 0, quota = 0 } = await navigator.storage.estimate()

  let persisted = false
  try {
    persisted = (await navigator.storage.persisted?.()) ?? false
  } catch {
    // Permission policy can block the query outright — not fatal.
  }

  return { usage, quota, available: Math.max(0, quota - usage), persisted }
}

/**
 * Ask the browser to stop evicting this origin under disk pressure.
 *
 * Kept apart from `estimateQuota` because in Firefox this shows a permission
 * prompt. Merely looking at a book's size must not put a dialog in front of
 * someone who has not decided to import it yet — call this only once the user
 * has committed to storing something.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return (await navigator.storage.persist()) ?? false
  } catch {
    return false
  }
}
