import type { RepoMeta } from '../types'
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

export async function fetchRepoFiles(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const headers = makeHeaders(token)

  // 1. Get commit tree SHA for branch
  onProgress?.('Reading file tree…')
  const branchRes = await fetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    { headers, signal },
  )
  if (branchRes.status === 401 || branchRes.status === 403) throw new Error('AUTH_REQUIRED')
  if (branchRes.status === 404) throw new Error('REPO_NOT_FOUND')
  if (!branchRes.ok) throw new Error(`Branch fetch failed: ${branchRes.status}`)
  const branchData = await branchRes.json()
  const treeSha: string = branchData.commit.commit.tree.sha

  // 2. Get full recursive tree (1 API call, CORS-safe)
  const treeRes = await fetch(
    `${BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${treeSha}?recursive=1`,
    { headers, signal },
  )
  if (treeRes.status === 429) throw new Error('RATE_LIMITED')
  if (!treeRes.ok) throw new Error(`Tree fetch failed: ${treeRes.status}`)
  const treeData = await treeRes.json()
  log.log(`tree ${treeSha.slice(0, 7)}: ${treeData.tree?.length ?? 0} items`)

  if (treeData.truncated) {
    log.warn('tree truncated (repo >100k items) — some files may be missing')
  }

  // 3. Filter to text blobs we care about
  type TreeItem = { type: string; path: string; size: number }
  const blobs = (treeData.tree as TreeItem[]).filter((item) => {
    if (item.type !== 'blob') return false
    if (item.size > MAX_FILE_BYTES) return false
    const parts = item.path.split('/')
    if (parts.some((p) => SKIP_DIRS.has(p))) return false
    if (isBinary(item.path)) return false
    return true
  })
  log.log(`${blobs.length} text blobs to fetch (filtered from ${treeData.tree?.length ?? 0} tree items, ` +
    `max ${MAX_FILE_BYTES} bytes/file)`)

  // 4. Fetch content from raw.githubusercontent.com in parallel batches
  // raw.githubusercontent.com is CORS-accessible and supports Bearer auth for private repos
  const result = new Map<string, string>()
  const rawBase = `${RAW_BASE}/${owner}/${repo}/${branch}`

  for (let i = 0; i < blobs.length; i += FETCH_CONCURRENCY) {
    if (signal?.aborted) break
    const batch = blobs.slice(i, i + FETCH_CONCURRENCY)
    const end = Math.min(i + FETCH_CONCURRENCY, blobs.length)
    onProgress?.(`Fetching files ${i + 1}–${end} of ${blobs.length}…`)

    await Promise.allSettled(
      batch.map(async ({ path }) => {
        const res = await fetch(`${rawBase}/${path}`, { headers, signal })
        if (!res.ok) {
          log.warn(`skip ${path} — HTTP ${res.status}`)
          return
        }
        result.set(path, await res.text())
      }),
    )
  }

  log.log(`fetched ${result.size}/${blobs.length} file contents`)
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
