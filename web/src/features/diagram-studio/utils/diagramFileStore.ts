// IndexedDB-backed store for Diagram Studio files.
// Each record holds the full file; the UI lists metadata and fetches
// code on demand when a file is selected.

export interface DiagramFileRecord {
  id: string
  name: string
  code: string
  order: number
}

export type DiagramFileMeta = Pick<DiagramFileRecord, 'id' | 'name' | 'order'>

const DB_NAME = 'diagram-studio'
const STORE = 'files'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllFiles(): Promise<DiagramFileRecord[]> {
  const store = await tx('readonly')
  const all = await wrap(store.getAll() as IDBRequest<DiagramFileRecord[]>)
  return all.sort((a, b) => a.order - b.order)
}

export async function getFile(id: string): Promise<DiagramFileRecord | undefined> {
  const store = await tx('readonly')
  return wrap(store.get(id) as IDBRequest<DiagramFileRecord | undefined>)
}

export async function putFile(file: DiagramFileRecord): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.put(file))
}

export async function deleteFile(id: string): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.delete(id))
}
