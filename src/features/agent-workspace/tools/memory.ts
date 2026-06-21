import { openDB } from 'idb'

const DB_NAME = 'agent-memory'
const STORE = 'memory_kv'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE)
    },
  })
}

export async function remember(key: string, value: string): Promise<string> {
  const db = await getDb()
  await db.put(STORE, { value, timestamp: Date.now() }, key)
  return `Stored "${key}".`
}

export async function recall(key: string): Promise<string> {
  const db = await getDb()
  const entry = await db.get(STORE, key)
  if (!entry) return `No value found for key "${key}".`
  return entry.value
}

export async function listKeys(): Promise<string> {
  const db = await getDb()
  const keys = await db.getAllKeys(STORE)
  if (keys.length === 0) return 'No keys stored.'
  return keys.join(', ')
}

export async function executeMemory(args: Record<string, unknown>): Promise<string> {
  const op = args.operation as string
  const key = args.key as string | undefined
  const value = args.value as string | undefined

  if (op === 'remember') {
    if (!key) return '[ERROR] memory: key is required for remember'
    if (value === undefined) return '[ERROR] memory: value is required for remember'
    return remember(key, value)
  }
  if (op === 'recall') {
    if (!key) return '[ERROR] memory: key is required for recall'
    return recall(key)
  }
  if (op === 'list_keys') {
    return listKeys()
  }
  return `[ERROR] memory: unknown operation "${op}"`
}
