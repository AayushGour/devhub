import type { RepoBlob, RepoManifest, TreeDiff } from '../types'

// Build the persistable hash-diff manifest from a freshly fetched tree.
// `dirShas` is present only when the fetch came from the per-directory walk
// (large repos whose flat recursive listing truncates) — it lets the next
// fetch skip straight to walking and reuse unchanged subtrees.
export function buildManifest(
  treeSha: string,
  blobs: RepoBlob[],
  dirShas?: Record<string, string>,
): RepoManifest {
  const files: Record<string, string> = {}
  for (const b of blobs) files[b.path] = b.sha
  return { treeSha, files, ...(dirShas ? { dirShas } : {}) }
}

async function hashContent(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Fallback manifest for cache-only re-embeds where no real git blob SHAs are
// known (e.g. content saved before manifests existed). These hashes aren't
// git-compatible — that's fine, they only need to be stable and distinct from
// a real blob sha so the next network fetch correctly diffs against them
// instead of a permanently-missing manifest (which is what caused duplicate
// chunks on every migration re-embed). `treeSha: ''` never matches a real
// GitHub tree sha, so it can't false-positive a treeSha short-circuit either.
export async function buildManifestFromFiles(files: { path: string; content: string }[]): Promise<RepoManifest> {
  const entries = await Promise.all(files.map(async (f) => [f.path, await hashContent(f.content)] as const))
  return { treeSha: '', files: Object.fromEntries(entries) }
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

function baseOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

// Among several deleted paths with identical content, prefer the one most
// likely to be the actual rename source: same directory first, then same
// filename, else just take the next available one. Content is identical
// either way (that's why they're candidates at all) — this only affects
// which path label a re-keyed chunk shows, not correctness of the vectors.
function pickRenameFrom(to: string, candidates: string[]): number {
  const sameDir = candidates.findIndex((c) => dirOf(c) === dirOf(to))
  if (sameDir !== -1) return sameDir
  const sameBase = candidates.findIndex((c) => baseOf(c) === baseOf(to))
  if (sameBase !== -1) return sameBase
  return 0
}

// Diff a fresh blob list against the stored manifest. Classifies every path as
// added / modified / deleted / unchanged, then upgrades matching add+delete
// pairs (same blob sha) into renames so they never get re-downloaded/re-embedded.
export function diffTree(blobs: RepoBlob[], prev: RepoManifest | null): TreeDiff {
  const nextSha = new Map(blobs.map((b) => [b.path, b.sha]))
  const prevFiles = prev?.files ?? {}

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  const unchanged: string[] = []

  for (const [path, sha] of nextSha) {
    const prevSha = prevFiles[path]
    if (prevSha === undefined) added.push(path)
    else if (prevSha === sha) unchanged.push(path)
    else modified.push(path)
  }
  for (const path of Object.keys(prevFiles)) {
    if (!nextSha.has(path)) deleted.push(path)
  }

  // Rename detection: an added path whose blob sha matches a deleted path's sha
  // is the same content moved — re-key its chunks instead of re-embedding.
  const renamed: { from: string; to: string }[] = []
  if (added.length && deleted.length) {
    const deletedBySha = new Map<string, string[]>()
    for (const path of deleted) {
      const sha = prevFiles[path]
      const list = deletedBySha.get(sha)
      if (list) list.push(path)
      else deletedBySha.set(sha, [path])
    }
    const stillAdded: string[] = []
    const pairedDeleted = new Set<string>()
    for (const path of added) {
      const sha = nextSha.get(path)!
      const candidates = deletedBySha.get(sha)
      if (candidates && candidates.length > 0) {
        const idx = pickRenameFrom(path, candidates)
        const [from] = candidates.splice(idx, 1)
        renamed.push({ from, to: path })
        pairedDeleted.add(from)
      } else {
        stillAdded.push(path)
      }
    }
    added.length = 0
    added.push(...stillAdded)
    const stillDeleted = deleted.filter((p) => !pairedDeleted.has(p))
    deleted.length = 0
    deleted.push(...stillDeleted)
  }

  return { added, modified, deleted, renamed, unchanged }
}
