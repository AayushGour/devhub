import { openDB, type IDBPDatabase } from 'idb'
import type { RepoMeta, RepoFile, RepoGraph, WikiPage, RepoChunk, RepoManifest } from '../types'

const DB_NAME = 'repo-explorer'
// v2: replaced the single-blob `repo_embeddings` store with per-chunk rows
// (`repo_chunks`) and added `repo_manifest` for incremental hash-diff indexing.
const DB_VERSION = 2

const STORES = {
  meta: 'repo_meta',
  files: 'repo_files',
  graph: 'repo_graph',
  chunks: 'repo_chunks',
  manifest: 'repo_manifest',
  wiki: 'repo_wiki',
} as const

export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

// Serializes fetch+index+manifest-save per repo (same-origin, cross-tab) so two
// tabs — or a double-click refetch — can't both diff against the same stale
// manifest and duplicate-embed the same files. Falls back to running inline
// where the Web Locks API isn't available.
export async function withRepoLock<T>(owner: string, repo: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn()
  return navigator.locks.request(`repo-explorer:${repoKey(owner, repo)}`, fn)
}

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Simple key-value stores (put-by-key).
      for (const store of [STORES.meta, STORES.files, STORES.graph, STORES.manifest, STORES.wiki]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
      // Per-chunk store with indexes for repo-scoped read + path-scoped delete.
      if (!db.objectStoreNames.contains(STORES.chunks)) {
        const chunks = db.createObjectStore(STORES.chunks, { keyPath: 'id', autoIncrement: true })
        chunks.createIndex('by_repo', 'repoKey', { unique: false })
        chunks.createIndex('by_repo_path', ['repoKey', 'path'], { unique: false })
      }
      // Drop the v1 single-blob embeddings store — cached repos re-index on open.
      if (oldVersion < 2 && db.objectStoreNames.contains('repo_embeddings')) {
        db.deleteObjectStore('repo_embeddings')
      }
    },
  })
  return _db
}

export async function saveRepo(meta: RepoMeta, files: RepoFile[], graph: RepoGraph): Promise<void> {
  const db = await getDB()
  const key = repoKey(meta.owner, meta.repo)
  const tx = db.transaction([STORES.meta, STORES.files, STORES.graph], 'readwrite')
  await tx.objectStore(STORES.meta).put(meta, key)
  await tx.objectStore(STORES.files).put(files, key)
  await tx.objectStore(STORES.graph).put(graph, key)
  await tx.done
}

export async function loadRepo(owner: string, repo: string): Promise<{
  meta: RepoMeta
  files: RepoFile[]
  graph: RepoGraph
} | null> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const [meta, files, graph] = await Promise.all([
    db.get(STORES.meta, key) as Promise<RepoMeta | undefined>,
    db.get(STORES.files, key) as Promise<RepoFile[] | undefined>,
    db.get(STORES.graph, key) as Promise<RepoGraph | undefined>,
  ])
  if (!meta || !files || !graph) return null
  return { meta, files, graph }
}

// ---- Manifest (Merkle snapshot) ----

export async function saveManifest(owner: string, repo: string, manifest: RepoManifest): Promise<void> {
  const db = await getDB()
  await db.put(STORES.manifest, manifest, repoKey(owner, repo))
}

export async function loadManifest(owner: string, repo: string): Promise<RepoManifest | null> {
  const db = await getDB()
  return (await db.get(STORES.manifest, repoKey(owner, repo)) as RepoManifest | undefined) ?? null
}

// ---- Chunks (per-chunk vectors) ----

export async function putChunks(chunks: Omit<RepoChunk, 'id'>[]): Promise<void> {
  if (chunks.length === 0) return
  const db = await getDB()
  const tx = db.transaction(STORES.chunks, 'readwrite')
  await Promise.all(chunks.map((c) => tx.store.add(c)))
  await tx.done
}

export async function getChunksByRepo(repoKeyStr: string): Promise<RepoChunk[]> {
  const db = await getDB()
  return (await db.getAllFromIndex(STORES.chunks, 'by_repo', repoKeyStr)) as RepoChunk[]
}

// Distinct set of paths that already have at least one persisted chunk for
// this repo. Key-only cursor — never loads chunk text/vectors — so this is
// cheap even for a large already-indexed repo. Used to resume an interrupted
// cache-only re-index (see `loadExistingRepo`) by finding exactly which files
// still need embedding, instead of an all-or-nothing "does this repo have any
// chunks at all" check.
export async function getIndexedPaths(repoKeyStr: string): Promise<Set<string>> {
  const db = await getDB()
  const paths = new Set<string>()
  const upperBound = String.fromCharCode(0xffff)
  let cursor = await db.transaction(STORES.chunks).store
    .index('by_repo_path')
    .openKeyCursor(IDBKeyRange.bound([repoKeyStr, ''], [repoKeyStr, upperBound]))
  while (cursor) {
    paths.add((cursor.key as [string, string])[1])
    cursor = await cursor.continue()
  }
  return paths
}

// Resume check: does at least one chunk already exist for this path stamped
// with `blobSha`? All of a file's chunks share the same blobSha (stamped
// uniformly by indexRepo), so the first row is enough to tell — lets a
// resumed index skip re-embedding a file that was already fully persisted in
// an earlier attempt at the same diff (e.g. before a page refresh interrupted
// a large index).
export async function hasChunkForPathSha(repoKeyStr: string, path: string, blobSha: string): Promise<boolean> {
  const db = await getDB()
  const cursor = await db.transaction(STORES.chunks).store
    .index('by_repo_path')
    .openCursor(IDBKeyRange.only([repoKeyStr, path]))
  return cursor ? cursor.value.blobSha === blobSha : false
}

export async function deleteChunksByPath(repoKeyStr: string, path: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES.chunks, 'readwrite')
  let cursor = await tx.store.index('by_repo_path').openCursor(IDBKeyRange.only([repoKeyStr, path]))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function deleteChunksByRepo(repoKeyStr: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES.chunks, 'readwrite')
  let cursor = await tx.store.index('by_repo').openCursor(IDBKeyRange.only(repoKeyStr))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

// Re-key a file's chunks after a pure rename (same content hash → no re-embed).
export async function renameChunkPath(repoKeyStr: string, from: string, to: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES.chunks, 'readwrite')
  let cursor = await tx.store.index('by_repo_path').openCursor(IDBKeyRange.only([repoKeyStr, from]))
  while (cursor) {
    await cursor.update({ ...cursor.value, path: to })
    cursor = await cursor.continue()
  }
  await tx.done
}

// ---- Wiki ----

export async function saveWikiPage(owner: string, repo: string, page: WikiPage): Promise<void> {
  const db = await getDB()
  const key = `${repoKey(owner, repo)}::${page.path}`
  await db.put(STORES.wiki, page, key)
}

export async function loadWikiPage(owner: string, repo: string, path: string): Promise<WikiPage | null> {
  const db = await getDB()
  const key = `${repoKey(owner, repo)}::${path}`
  return (await db.get(STORES.wiki, key) as WikiPage | undefined) ?? null
}

export async function listRepos(): Promise<RepoMeta[]> {
  const db = await getDB()
  return (await db.getAll(STORES.meta)) as RepoMeta[]
}

export async function deleteRepo(owner: string, repo: string): Promise<void> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const tx = db.transaction(
    [STORES.meta, STORES.files, STORES.graph, STORES.manifest],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore(STORES.meta).delete(key),
    tx.objectStore(STORES.files).delete(key),
    tx.objectStore(STORES.graph).delete(key),
    tx.objectStore(STORES.manifest).delete(key),
  ])
  await tx.done

  await deleteChunksByRepo(key)

  // wiki pages have composite keys — delete by prefix
  const allWikiKeys = await db.getAllKeys(STORES.wiki) as string[]
  const prefix = `${key}::`
  const toDelete = allWikiKeys.filter((k) => k.startsWith(prefix))
  const wikiTx = db.transaction(STORES.wiki, 'readwrite')
  await Promise.all(toDelete.map((k) => wikiTx.store.delete(k)))
  await wikiTx.done
}
