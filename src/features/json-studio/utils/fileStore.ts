// IndexedDB-backed store for JSON Studio files.
// Each record holds the full file; the UI lists metadata and fetches
// content on demand when a file is selected.

export interface JsonFileRecord {
  id: string
  name: string
  content: string
  order: number
}

export type JsonFileMeta = Pick<JsonFileRecord, 'id' | 'name' | 'order'>

const DB_NAME = 'json-studio'
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

export async function getAllFiles(): Promise<JsonFileRecord[]> {
  const store = await tx('readonly')
  const all = await wrap(store.getAll() as IDBRequest<JsonFileRecord[]>)
  return all.sort((a, b) => a.order - b.order)
}

export async function getFile(id: string): Promise<JsonFileRecord | undefined> {
  const store = await tx('readonly')
  return wrap(store.get(id) as IDBRequest<JsonFileRecord | undefined>)
}

export async function putFile(file: JsonFileRecord): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.put(file))
}

export async function deleteFile(id: string): Promise<void> {
  const store = await tx('readwrite')
  await wrap(store.delete(id))
}
