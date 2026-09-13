// UI-facing state for Audiobook Studio.
//
// IndexedDB is the source of truth; this store is a render-friendly mirror of
// it plus the bits of state that are purely visual. Nothing here is persisted
// by zustand — reloading rehydrates from the database via `refreshBooks`.

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import * as db from '../utils/db'
import { DEFAULT_SETTINGS, type BookRecord, type JobRecord, type SettingsRecord } from '../types'

interface AudiobookState {
  books: BookRecord[]
  booksLoaded: boolean
  activeBookId: string | null
  /** Live conversion progress, keyed by book id. */
  jobs: Record<string, JobRecord>
  settings: SettingsRecord

  /** Collapsed while reading so the rail stops competing for reading width. */
  railCollapsed: boolean
  /** True once the user has manually toggled the rail — suppresses auto-collapse. */
  railPinned: boolean

  refreshBooks: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (patch: Partial<SettingsRecord>) => Promise<void>

  setActiveBook: (id: string | null) => void
  upsertBook: (book: BookRecord) => void
  removeBook: (id: string) => Promise<void>

  setJob: (job: JobRecord) => void
  clearJob: (bookId: string) => void

  toggleRail: () => void
  /** Collapse on playback start unless the user has taken manual control. */
  autoCollapseRail: () => void
}

export const useAudiobookStore = create<AudiobookState>()((set, get) => ({
  books: [],
  booksLoaded: false,
  activeBookId: null,
  jobs: {},
  settings: DEFAULT_SETTINGS,
  railCollapsed: false,
  railPinned: false,

  refreshBooks: async () => {
    const [books, jobs] = await Promise.all([db.listBooks(), db.listResumableJobs()])
    set({
      books,
      booksLoaded: true,
      jobs: Object.fromEntries(jobs.map((job) => [job.bookId, job])),
    })
  },

  loadSettings: async () => set({ settings: await db.getSettings() }),

  saveSettings: async (patch) => set({ settings: await db.putSettings(patch) }),

  setActiveBook: (id) => set({ activeBookId: id }),

  upsertBook: (book) =>
    set((s) => {
      const exists = s.books.some((b) => b.id === book.id)
      const books = exists
        ? s.books.map((b) => (b.id === book.id ? book : b))
        : [book, ...s.books]
      return { books }
    }),

  removeBook: async (id) => {
    await db.deleteBook(id)
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      activeBookId: s.activeBookId === id ? null : s.activeBookId,
      jobs: Object.fromEntries(Object.entries(s.jobs).filter(([key]) => key !== id)),
    }))
  },

  setJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.bookId]: job } })),

  clearJob: (bookId) =>
    set((s) => ({
      jobs: Object.fromEntries(Object.entries(s.jobs).filter(([key]) => key !== bookId)),
    })),

  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed, railPinned: true })),

  autoCollapseRail: () => {
    if (!get().railPinned) set({ railCollapsed: true })
  },
}))

export function useActiveBook(): BookRecord | undefined {
  return useAudiobookStore((s) => s.books.find((b) => b.id === s.activeBookId))
}

export function useJob(bookId: string | null | undefined): JobRecord | undefined {
  return useAudiobookStore((s) => (bookId ? s.jobs[bookId] : undefined))
}

/** Books currently being worked on, for the rail's activity indicator. */
export function useBusyBookIds(): string[] {
  return useAudiobookStore(
    useShallow((s) =>
      s.books
        .filter((b) => b.status === 'parsing' || b.status === 'narrating' || b.status === 'sealing')
        .map((b) => b.id),
    ),
  )
}
