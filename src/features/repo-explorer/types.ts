export interface RepoMeta {
  owner: string
  repo: string
  url: string
  defaultBranch: string
  fetchedAt: number
  fileCount: number
  languages: string[]
}

export interface RepoFile {
  path: string
  content: string
  language: string
  sizeBytes: number
  skipped?: 'too-large' | 'binary'
}

export interface DepNode {
  id: string          // file path or package name
  label: string       // short display name
  type: 'internal' | 'external'
  language: string
  color: string       // language color
  path?: string       // only for internal nodes
  packageName?: string // only for external nodes
}

export interface DepEdge {
  id: string
  source: string      // node id
  target: string      // node id
}

export interface RepoGraph {
  nodes: DepNode[]
  edges: DepEdge[]
}

export interface WikiPage {
  path: string
  content: string     // markdown
  generatedAt: number
}

export interface RepoIndexedData {
  meta: RepoMeta
  files: RepoFile[]
  graph: RepoGraph
  // embeddings stored separately in repoDb
}

export interface GithubTreeItem {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
  url: string
}
