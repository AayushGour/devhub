export type Theme = 'light' | 'dark' | 'github' | 'nord' | 'dracula'

export interface Workspace {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface FileEntry {
  id: string
  workspaceId: string
  name: string
  type: 'markdown' | 'json' | 'yaml' | 'sql' | 'diagram'
  content: string
  createdAt: number
  updatedAt: number
}
