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
  // chunk vectors stored separately in repoDb (repo_chunks store)
}

// What a fetch returns to the caller: the repo data plus the tree diff and the
// fresh path→blobSha map, so the indexer can re-embed only what changed.
export interface RepoFetchResult extends RepoIndexedData {
  diff: TreeDiff
  shaByPath: Record<string, string>
  manifest: RepoManifest
}

export interface GithubTreeItem {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
  url: string
}

// A blob entry from the git Trees API — path + content hash, no content yet.
export interface RepoBlob {
  path: string
  sha: string
  size: number
}

// Persisted per-repo Merkle snapshot. `treeSha` is the git tree SHA (the Merkle
// root); `files` maps each path to its git blob SHA (the leaf content hash).
// A re-index short-circuits when `treeSha` is unchanged, else diffs `files`.
export interface RepoManifest {
  treeSha: string
  files: Record<string, string>
  // Per-directory tree SHAs, present only for repos that needed the
  // per-directory walk (i.e. ones whose flat recursive listing truncates).
  // Lets the next fetch skip straight to walking, and skip re-descending
  // into any subtree whose own tree sha hasn't changed.
  dirShas?: Record<string, string>
}

// Result of diffing a fresh tree against the stored manifest.
export interface TreeDiff {
  added: string[]                    // new paths
  modified: string[]                 // same path, changed blob sha
  deleted: string[]                  // paths no longer present
  renamed: { from: string; to: string }[] // same blob sha, moved path (no re-embed)
  unchanged: string[]                // same path + sha
}

// One embedded chunk of a file. Line ranges are 1-based (Monaco-friendly).
export interface RepoChunk {
  id?: number
  repoKey: string      // `owner/repo`
  path: string
  blobSha: string      // content hash of the file this chunk came from
  startLine: number
  endLine: number
  text: string
  vector: number[]
}

// A retrieval hit surfaced in chat, pointing at an exact file region.
export interface Citation {
  path: string
  startLine: number
  endLine: number
  score: number
}
