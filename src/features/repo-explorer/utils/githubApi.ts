import type { GithubTreeItem, RepoMeta } from '../types'

const BASE = 'https://api.github.com'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'vendor', 'venv', '.venv', '__pycache__', '.mypy_cache',
  'target', 'bin', 'obj', '.gradle', '.idea', '.vscode',
  'coverage', '.nyc_output', 'storybook-static',
])

const MAX_FILE_BYTES = 100_000

function makeHeaders(token?: string): HeadersInit {
  const h: HeadersInit = { Accept: 'application/vnd.github.v3+json' }
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
  const res = await fetch(`${BASE}/repos/${owner}/${repo}`, { headers: makeHeaders(token) })
  if (res.status === 401 || res.status === 403) throw new Error('AUTH_REQUIRED')
  if (res.status === 404) throw new Error('REPO_NOT_FOUND')
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json()
  return { defaultBranch: data.default_branch ?? 'main', description: data.description ?? '' }
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<GithubTreeItem[]> {
  const res = await fetch(
    `${BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: makeHeaders(token) },
  )
  if (!res.ok) throw new Error(`Tree fetch failed: ${res.status}`)
  const data = await res.json()
  if (data.truncated) {
    console.warn('[repo-explorer] Tree truncated — repo has >100k files, results partial')
  }
  const items: GithubTreeItem[] = data.tree ?? []
  return items.filter((item) => {
    if (item.type !== 'blob') return false
    const parts = item.path.split('/')
    if (parts.some((p) => SKIP_DIRS.has(p))) return false
    if ((item.size ?? 0) > MAX_FILE_BYTES) return false
    return true
  })
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string,
): Promise<string> {
  const res = await fetch(
    `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    { headers: makeHeaders(token) },
  )
  if (!res.ok) throw new Error(`File fetch failed: ${path} — ${res.status}`)
  const data = await res.json()
  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''))
  }
  return data.content ?? ''
}

export async function fetchFilesBatched(
  owner: string,
  repo: string,
  paths: string[],
  token?: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const BATCH = 5
  const results = new Map<string, string>()
  for (let i = 0; i < paths.length; i += BATCH) {
    if (signal?.aborted) break
    const batch = paths.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await fetchFileContent(owner, repo, path, token)
          results.set(path, content)
        } catch {
          results.set(path, '')
        }
      }),
    )
    onProgress?.(Math.min(i + BATCH, paths.length), paths.length)
  }
  return results
}

export function buildRepoMeta(
  owner: string,
  repo: string,
  defaultBranch: string,
  languages: string[],
  fileCount: number,
  token?: string,
): RepoMeta {
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    defaultBranch,
    fetchedAt: Date.now(),
    fileCount,
    languages,
    githubToken: token,
  }
}
