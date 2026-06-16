import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'rag-studio-vectors'
const DB_VERSION = 1
const STORE = 'knowledge_nodes'

export interface KnowledgeNode {
  id?: number
  text: string
  rawChunk: string
  sourceFile: string
  vector: number[]
}

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by_source', 'sourceFile', { unique: false })
      }
    },
  })
  return _db
}

export async function putNode(node: Omit<KnowledgeNode, 'id'>): Promise<number> {
  const db = await getDB()
  return db.add(STORE, node) as Promise<number>
}

export async function getAllNodes(): Promise<KnowledgeNode[]> {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function clearAll(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

export async function clearBySource(sourceFile: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by_source')
  let cursor = await index.openCursor(IDBKeyRange.only(sourceFile))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function getSourceFiles(): Promise<string[]> {
  const nodes = await getAllNodes()
  return [...new Set(nodes.map((n) => n.sourceFile))]
}
