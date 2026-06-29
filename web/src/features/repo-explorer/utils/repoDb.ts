import { openDB, type IDBPDatabase } from 'idb'
import type { RepoMeta, RepoFile, RepoGraph, WikiPage } from '../types'

const DB_NAME = 'repo-explorer'
const DB_VERSION = 1

const STORES = {
  meta: 'repo_meta',
  files: 'repo_files',
  graph: 'repo_graph',
  embeddings: 'repo_embeddings',
  wiki: 'repo_wiki',
} as const

function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store)
        }
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

export async function saveEmbeddings(
  owner: string,
  repo: string,
  embeddings: Map<string, number[]>,
): Promise<void> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  // Convert Map to plain object for IDB storage
  await db.put(STORES.embeddings, Object.fromEntries(embeddings), key)
}

export async function loadEmbeddings(
  owner: string,
  repo: string,
): Promise<Map<string, number[]> | null> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const raw = await db.get(STORES.embeddings, key) as Record<string, number[]> | undefined
  if (!raw) return null
  return new Map(Object.entries(raw))
}

export async function saveWikiPage(
  owner: string,
  repo: string,
  page: WikiPage,
): Promise<void> {
  const db = await getDB()
  const key = `${repoKey(owner, repo)}::${page.path}`
  await db.put(STORES.wiki, page, key)
}

export async function loadWikiPage(
  owner: string,
  repo: string,
  path: string,
): Promise<WikiPage | null> {
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
    [STORES.meta, STORES.files, STORES.graph, STORES.embeddings],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore(STORES.meta).delete(key),
    tx.objectStore(STORES.files).delete(key),
    tx.objectStore(STORES.graph).delete(key),
    tx.objectStore(STORES.embeddings).delete(key),
  ])
  await tx.done
  // wiki pages have composite keys — delete by prefix
  const wikiDb = await getDB()
  const allWikiKeys = await wikiDb.getAllKeys(STORES.wiki) as string[]
  const prefix = `${key}::`
  const toDelete = allWikiKeys.filter((k) => k.startsWith(prefix))
  const wikiTx = wikiDb.transaction(STORES.wiki, 'readwrite')
  await Promise.all(toDelete.map((k) => wikiTx.store.delete(k)))
  await wikiTx.done
}
