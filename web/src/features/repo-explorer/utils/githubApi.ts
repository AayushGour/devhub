import type { RepoMeta, RepoBlob } from '../types'
import { isBinary } from './languageDetect'
import { createLogger } from '@/lib/logger'

const log = createLogger('repo:github-api')

const BASE = 'https://api.github.com'
const RAW_BASE = 'https://raw.githubusercontent.com'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'vendor', 'venv', '.venv', '__pycache__', '.mypy_cache',
  'target', 'bin', 'obj', '.gradle', '.idea', '.vscode',
  'coverage', '.nyc_output', 'storybook-static',
])

const MAX_FILE_BYTES = 100_000
const FETCH_CONCURRENCY = 20

function makeHeaders(token?: string): HeadersInit {
  const h: HeadersInit = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?\s#]+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ defaultBranch: string; description: string }> {
  const res = await fetch(`${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: { ...makeHeaders(token), Accept: 'application/vnd.github.v3+json' },
  })
  if (res.status === 401 || res.status === 403) throw new Error('AUTH_REQUIRED')
  if (res.status === 404) throw new Error('REPO_NOT_FOUND')
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json()
  return { defaultBranch: data.default_branch ?? 'main', description: data.description ?? '' }
}

// Cheap call: just the current tree sha for a branch. Callers compare this
// against a stored manifest's treeSha to short-circuit the (more expensive)
// full recursive tree listing when nothing has changed since the last fetch.
export async function fetchBranchTreeSha(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  signal?: AbortSignal,
): Promise<string> {
  const headers = makeHeaders(token)
  const branchRes = await fetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    { headers, signal },
  )
  if (branchRes.status === 401 || branchRes.status === 403) throw new Error('AUTH_REQUIRED')
  if (branchRes.status === 404) throw new Error('REPO_NOT_FOUND')
  if (!branchRes.ok) throw new Error(`Branch fetch failed: ${branchRes.status}`)
  const branchData = await branchRes.json()
  return branchData.commit.commit.tree.sha
}

// Fetch the repo's recursive git tree for a known tree sha and return the
// filtered text blobs WITH their content hashes (git blob SHAs). No file
// content is downloaded here — this is the cheap "hash snapshot" step
// (1 API call). Each blob `sha` is a leaf content hash used for diffing.
//
// GitHub silently truncates this response above ~100k tree entries —
// `truncated` surfaces that to the caller so it can fall back to
// `fetchTreeWalk` instead of silently missing files.
export async function fetchTreeBlobs(
  owner: string,
  repo: string,
  treeSha: string,
  token?: string,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<{ blobs: RepoBlob[]; truncated: boolean }> {
  const headers = makeHeaders(token)
  onProgress?.('Reading file tree…')

  // Full recursive tree (1 API call, CORS-safe)
  const treeRes = await fetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeSha}?recursive=1`,
    { headers, signal },
  )
  if (treeRes.status === 429) throw new Error('RATE_LIMITED')
  if (!treeRes.ok) throw new Error(`Tree fetch failed: ${treeRes.status}`)
  const treeData = await treeRes.json()
  log.log(`tree ${treeSha.slice(0, 7)}: ${treeData.tree?.length ?? 0} items`)

  const truncated = treeData.truncated === true
  if (truncated) {
    log.warn('tree truncated (repo >100k items) — falling back to per-directory walk')
  }

  // Filter to text blobs we care about — keep the git blob `sha` (content hash)
  type TreeItem = { type: string; path: string; size: number; sha: string }
  const blobs: RepoBlob[] = (treeData.tree as TreeItem[])
    .filter((item) => {
      if (item.type !== 'blob') return false
      if (item.size > MAX_FILE_BYTES) return false
      const parts = item.path.split('/')
      if (parts.some((p) => SKIP_DIRS.has(p))) return false
      if (isBinary(item.path)) return false
      return true
    })
    .map((item) => ({ path: item.path, sha: item.sha, size: item.size }))
  log.log(`${blobs.length} text blobs (filtered from ${treeData.tree?.length ?? 0} tree items, ` +
    `max ${MAX_FILE_BYTES} bytes/file)`)

  return { blobs, truncated }
}

// One non-recursive directory listing — `GET .../git/trees/{dirSha}` with no
// `?recursive=1`. Used by `fetchTreeWalk` to walk large repos directory-by-
// directory when the flat recursive listing truncates. Each returned item's
// `path` is the item's own name relative to `dirSha` (NOT a repo-root-relative
// path) — callers must prefix it with the current directory path themselves.
export async function fetchTreeDir(
  owner: string,
  repo: string,
  dirSha: string,
  token?: string,
  signal?: AbortSignal,
): Promise<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }[]> {
  const headers = makeHeaders(token)
  const res = await fetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${dirSha}`,
    { headers, signal },
  )
  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (!res.ok) throw new Error(`Tree dir fetch failed: ${res.status}`)
  const data = await res.json()
  type TreeItem = { type: 'blob' | 'tree'; path: string; size?: number; sha: string }
  return (data.tree as TreeItem[]).map((item) => ({
    path: item.path, type: item.type, sha: item.sha, size: item.size,
  }))
}

// Tiny concurrency limiter — a counter + FIFO waiters queue. Bounds how many
// `fetchTreeDir` calls are in flight at once across the whole recursive walk
// (not per-directory), so a wide tree doesn't fan out into hundreds of
// simultaneous requests. No existing helper for this in the codebase and no
// new dependency is warranted for ~15 lines.
class ConcurrencyLimiter {
  private active = 0
  private readonly waiters: (() => void)[] = []
  private readonly max: number

  constructor(max: number) {
    this.max = max
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiters.shift()?.()
    }
  }
}

// Recursive directory-by-directory tree walk for repos whose flat recursive
// listing truncates. Reuses cached entries for any subtree whose own tree sha
// hasn't changed since `prevDirShas` was recorded, so a repeat fetch of a huge
// repo only touches the handful of directories that actually changed.
export async function fetchTreeWalk(
  owner: string,
  repo: string,
  rootTreeSha: string,
  prevDirShas: Record<string, string>,
  prevFiles: Record<string, string>,
  token?: string,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<{ blobs: RepoBlob[]; dirShas: Record<string, string> }> {
  const blobs: RepoBlob[] = []
  const dirShas: Record<string, string> = {}
  const limiter = new ConcurrencyLimiter(FETCH_CONCURRENCY)
  let dirCount = 0

  async function walk(dirPath: string, dirSha: string): Promise<void> {
    dirShas[dirPath] = dirSha

    // Subtree unchanged since the last fetch — reuse cached entries instead
    // of hitting the API for it (and everything under it).
    if (prevDirShas[dirPath] === dirSha) {
      for (const [path, sha] of Object.entries(prevFiles)) {
        const matches = dirPath === '' || path === dirPath || path.startsWith(`${dirPath}/`)
        if (matches) blobs.push({ path, sha, size: 0 })
      }
      return
    }

    if (signal?.aborted) return
    const items = await limiter.run(() => fetchTreeDir(owner, repo, dirSha, token, signal))
    dirCount++
    onProgress?.(`Scanning directories… (${dirCount} dirs, ${blobs.length} files)`)

    const subdirs: { path: string; sha: string }[] = []
    for (const item of items) {
      const path = dirPath ? `${dirPath}/${item.path}` : item.path
      if (item.type === 'tree') {
        if (SKIP_DIRS.has(item.path)) continue
        subdirs.push({ path, sha: item.sha })
      } else if (item.type === 'blob') {
        if ((item.size ?? 0) > MAX_FILE_BYTES) continue
        if (isBinary(path)) continue
        blobs.push({ path, sha: item.sha, size: item.size ?? 0 })
      }
    }

    if (signal?.aborted) return
    await Promise.all(subdirs.map((d) => walk(d.path, d.sha)))
  }

  onProgress?.('Scanning directories…')
  await walk('', rootTreeSha)
  log.log(`tree walk: ${dirCount} dirs fetched, ${blobs.length} blobs, ` +
    `${Object.keys(dirShas).length} dirShas recorded`)

  return { blobs, dirShas }
}

// Download raw content for a specific set of paths from raw.githubusercontent.com
// (CORS-accessible, Bearer-auth for private repos, and NOT subject to the GitHub
// API rate limit). Callers pass only the paths that actually changed.
export async function fetchBlobContents(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  token?: string,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const headers = makeHeaders(token)
  const result = new Map<string, string>()
  const rawBase = `${RAW_BASE}/${owner}/${repo}/${branch}`

  for (let i = 0; i < paths.length; i += FETCH_CONCURRENCY) {
    if (signal?.aborted) break
    const batch = paths.slice(i, i + FETCH_CONCURRENCY)
    const end = Math.min(i + FETCH_CONCURRENCY, paths.length)
    onProgress?.(`Fetching files ${i + 1}–${end} of ${paths.length}…`)

    await Promise.allSettled(
      batch.map(async (path) => {
        const res = await fetch(`${rawBase}/${path}`, { headers, signal })
        if (!res.ok) {
          log.warn(`skip ${path} — HTTP ${res.status}`)
          return
        }
        result.set(path, await res.text())
      }),
    )
  }

  log.log(`fetched ${result.size}/${paths.length} file contents`)
  return result
}

export function buildRepoMeta(
  owner: string,
  repo: string,
  defaultBranch: string,
  languages: string[],
  fileCount: number,
): RepoMeta {
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    defaultBranch,
    fetchedAt: Date.now(),
    fileCount,
    languages,
  }
}
