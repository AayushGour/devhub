// IndexedDB access for Audiobook Studio.
//
// Seven stores with two distinct lifetimes:
//   permanent  books, artifacts, progress, settings
//   staging    chapters, staging, jobs — dropped when a book is sealed
//
// Follows the `idb` wrapper pattern used by rag-studio's vectorDb.ts: one
// module-level connection promise, opened lazily.

import { openDB, type IDBPDatabase, type DBSchema } from 'idb'
import { createLogger } from '@/lib/logger'
import {
  DEFAULT_SETTINGS,
  type ArtifactRecord,
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
const DB_VERSION = 1

interface AudiobookDB extends DBSchema {
  books: { key: string; value: BookRecord }
  artifacts: { key: string; value: ArtifactRecord }
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
    upgrade(db) {
      db.createObjectStore('books', { keyPath: 'id' })
      db.createObjectStore('artifacts', { keyPath: 'bookId' })

      const chapters = db.createObjectStore('chapters', { keyPath: 'key' })
      chapters.createIndex('by_book', 'bookId')

      const staging = db.createObjectStore('staging', { keyPath: 'key' })
      staging.createIndex('by_book', 'bookId')

      db.createObjectStore('progress', { keyPath: 'bookId' })
      db.createObjectStore('jobs', { keyPath: 'bookId' })
      db.createObjectStore('settings', { keyPath: 'key' })
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
    db.delete('progress', id),
    db.delete('jobs', id),
    clearStaging(id),
  ])
  log.log(`deleted book ${id}`)
}

// ── artifacts ─────────────────────────────────────────────────────

export async function putArtifact(bookId: string, epub: Uint8Array): Promise<void> {
  await (await getDB()).put('artifacts', {
    bookId,
    epub,
    bytes: epub.byteLength,
    sealedAt: Date.now(),
  })
}

export async function getArtifact(bookId: string): Promise<ArtifactRecord | undefined> {
  return (await getDB()).get('artifacts', bookId)
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
    if (!persisted) persisted = (await navigator.storage.persist?.()) ?? false
  } catch {
    // Permission policy can block the request outright — not fatal.
  }

  return { usage, quota, available: Math.max(0, quota - usage), persisted }
}
