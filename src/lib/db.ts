import Dexie, { type Table } from 'dexie'
import type { Workspace, FileEntry } from '@/types'

class DevHubDB extends Dexie {
  workspaces!: Table<Workspace>
  files!: Table<FileEntry>

  constructor() {
    super('devhub')
    this.version(1).stores({
      workspaces: 'id, name, updatedAt',
      files: 'id, workspaceId, name, type, updatedAt',
    })
  }
}

export const db = new DevHubDB()
