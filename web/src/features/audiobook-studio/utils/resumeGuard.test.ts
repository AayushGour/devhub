// A sealed book must never be sent back through narration.
//
// Sealing clears the chapter rows, so narrating an already-sealed book finds
// nothing to do and would mark a finished book as failed. That is reachable
// whenever a job row outlives the conversion that wrote it — a reload landing
// between the seal and the job's deletion, for instance.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const artifacts = new Map<string, unknown>()
const books = new Map<string, Record<string, unknown>>()
const jobs = new Map<string, Record<string, unknown>>()

const patchBook = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  const next = { ...(books.get(id) ?? {}), ...patch }
  books.set(id, next)
  return next
})
const deleteJob = vi.fn(async (id: string) => { jobs.delete(id) })
const listChapters = vi.fn(async () => [])

vi.mock('./db', () => ({
  getArtifact: async (id: string) => artifacts.get(id),
  getBook: async (id: string) => books.get(id),
  getJob: async (id: string) => jobs.get(id),
  listChapters: () => listChapters(),
  listResumableJobs: async () => [...jobs.values()],
  patchBook: (id: string, patch: Record<string, unknown>) => patchBook(id, patch),
  putBook: async () => {},
  putJob: async () => {},
  deleteJob: (id: string) => deleteJob(id),
  putChapter: async () => {},
  putStaging: async () => {},
  listStaging: async () => [],
  clearStaging: async () => {},
  putArtifact: async () => {},
  estimateQuota: async () => ({ usage: 0, quota: 0, available: 0, persisted: true }),
  chapterKey: (b: string, i: number) => `${b}:${i}`,
  stagingKey: (b: string, k: string, i: number) => `${b}:${k}:${i}`,
}))

vi.mock('./bookSource', () => ({ clearBookCache: () => {}, loadOutline: async () => [] }))
vi.mock('@/lib/webgpu', () => ({ isWebGpuAvailable: async () => false }))

beforeEach(() => {
  artifacts.clear(); books.clear(); jobs.clear()
  patchBook.mockClear(); deleteJob.mockClear(); listChapters.mockClear()
  vi.resetModules()
})

const BOOK = 'b1'

function seedInterruptedJob(status: string) {
  books.set(BOOK, { id: BOOK, title: 'Salt', status, mode: 'narrated', voiceId: 'af_heart' })
  jobs.set(BOOK, {
    bookId: BOOK, stage: 'narrate', chapterCursor: 1, chapterCount: 3,
    sentenceCursor: 0, sentenceCount: 0, voiceId: 'af_heart', speed: 1,
  })
}

describe('resuming an interrupted conversion', () => {
  it('finishes a book that was already sealed instead of restarting it', async () => {
    seedInterruptedJob('sealing')
    artifacts.set(BOOK, { bookId: BOOK })

    const { resumeInterrupted } = await import('./conversionEngine')
    await resumeInterrupted()

    // The stale job is cleared and the book is reported finished...
    expect(deleteJob).toHaveBeenCalledWith(BOOK)
    expect(books.get(BOOK)).toMatchObject({ status: 'ready', error: undefined })
    // ...without ever looking for chapters, which sealing has already removed.
    expect(listChapters).not.toHaveBeenCalled()
  })

  it('leaves a genuinely unfinished book to resume', async () => {
    seedInterruptedJob('narrating')

    const { resumeInterrupted } = await import('./conversionEngine')
    await resumeInterrupted()

    // No artifact, so the book is not declared finished here.
    expect(deleteJob).not.toHaveBeenCalled()
    expect(books.get(BOOK)?.status).not.toBe('ready')
  })
})
