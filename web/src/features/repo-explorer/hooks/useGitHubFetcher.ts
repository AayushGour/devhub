import { useCallback, useState } from 'react'
import {
  parseGitHubUrl, fetchRepoMeta, fetchBranchTreeSha, fetchTreeBlobs, fetchTreeWalk, fetchBlobContents,
  buildRepoMeta,
} from '../utils/githubApi'
import { detectLanguage } from '../utils/languageDetect'
import { buildEdges } from '../utils/depParsers'
import { parseManifests } from '../utils/packageParsers'
import { saveRepo, loadRepo, loadManifest } from '../utils/repoDb'
import { diffTree, buildManifest } from '../utils/diffTree'
import { useIndexingStore } from '@/store/indexingStore'
import { createLogger } from '@/lib/logger'
import type { RepoFile, RepoBlob, DepNode, DepEdge, RepoGraph, RepoFetchResult, TreeDiff } from '../types'

const log = createLogger('repo:fetch')

export function useGitHubFetcher() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const indexingStart = useIndexingStore((s) => s.start)
  const indexingSetPhase = useIndexingStore((s) => s.setPhase)
  const indexingFinish = useIndexingStore((s) => s.finish)
  const indexingSetError = useIndexingStore((s) => s.setError)

  const fetchRepo = useCallback(async (
    url: string,
    token?: string,
  ): Promise<RepoFetchResult | null> => {
    setLoading(true)
    setError(null)

    const parsed = parseGitHubUrl(url)
    if (!parsed) {
      log.warn(`invalid GitHub URL: ${url}`)
      setError('Invalid GitHub URL. Expected: https://github.com/owner/repo')
      setLoading(false)
      return null
    }

    const { owner, repo } = parsed
    const abortCtrl = new AbortController()
    const done = log.time(`fetchRepo ${owner}/${repo}`)
    log.log(`start ${owner}/${repo}`)
    indexingStart(`Fetching ${owner}/${repo}`, () => abortCtrl.abort())

    try {
      // 1. Repo metadata → default branch
      indexingSetPhase('fetching', `Connecting to ${owner}/${repo}…`)
      const { defaultBranch } = await fetchRepoMeta(owner, repo, token)
      log.log(`default branch: ${defaultBranch}`)
      if (abortCtrl.signal.aborted) { log.warn('aborted after meta'); setLoading(false); return null }

      // 2. Cheap call: current tree sha for the branch
      const treeSha = await fetchBranchTreeSha(owner, repo, defaultBranch, token, abortCtrl.signal)
      let prevManifest = await loadManifest(owner, repo)

      // 2a. Nothing changed since the last fetch — skip the full tree listing,
      // diff, and download entirely and reuse what's already cached.
      if (prevManifest && prevManifest.treeSha === treeSha) {
        const cached = await loadRepo(owner, repo)
        if (cached) {
          log.log(`treeSha unchanged (${treeSha.slice(0, 7)}) — skip tree/diff/download`)
          indexingFinish()
          setLoading(false)
          done('unchanged')
          const diff: TreeDiff = {
            added: [], modified: [], deleted: [], renamed: [],
            unchanged: cached.files.map((f) => f.path),
          }
          return { ...cached, diff, shaByPath: prevManifest.files, manifest: prevManifest }
        }
        log.warn(`manifest exists but no cached repo data for ${owner}/${repo} — falling through to full fetch`)
        prevManifest = null
      }
      if (abortCtrl.signal.aborted) { log.warn('aborted after tree sha'); setLoading(false); return null }

      // 3. Full tree listing → diff against stored manifest. Repos that already
      // needed the per-directory walk (dirShas present) skip straight to it — the
      // flat call is known to truncate for them.
      let blobs: RepoBlob[]
      let dirShas: Record<string, string> | undefined
      if (prevManifest?.dirShas && Object.keys(prevManifest.dirShas).length > 0) {
        indexingSetPhase('fetching', 'Scanning directories…')
        const walked = await fetchTreeWalk(
          owner, repo, treeSha, prevManifest.dirShas, prevManifest.files, token,
          (label) => indexingSetPhase('fetching', label),
          abortCtrl.signal,
        )
        blobs = walked.blobs
        dirShas = walked.dirShas
      } else {
        const flat = await fetchTreeBlobs(
          owner, repo, treeSha, token,
          (label) => indexingSetPhase('fetching', label),
          abortCtrl.signal,
        )
        if (flat.truncated) {
          log.warn(`flat tree listing truncated for ${owner}/${repo} — falling back to per-directory walk`)
          indexingSetPhase('fetching', 'Repo too large for a single listing — scanning directories…')
          const walked = await fetchTreeWalk(
            owner, repo, treeSha, prevManifest?.dirShas ?? {}, prevManifest?.files ?? {}, token,
            (label) => indexingSetPhase('fetching', label),
            abortCtrl.signal,
          )
          blobs = walked.blobs
          dirShas = walked.dirShas
        } else {
          blobs = flat.blobs
        }
      }
      const diff = diffTree(blobs, prevManifest)
      const manifest = buildManifest(treeSha, blobs, dirShas)
      log.log(`diff: +${diff.added.length} ~${diff.modified.length} -${diff.deleted.length} ` +
        `→${diff.renamed.length} =${diff.unchanged.length} (treeSha ${treeSha.slice(0, 7)})`)

      // 4. Cached content for unchanged/renamed files (avoids re-downloading them)
      const cached = await loadRepo(owner, repo)
      const cachedByPath = new Map<string, string>((cached?.files ?? []).map((f) => [f.path, f.content]))
      const renameToFrom = new Map(diff.renamed.map((r) => [r.to, r.from]))

      // 5. Download ONLY added + modified files (raw CDN, not API-rate-limited)
      const toDownload = [...diff.added, ...diff.modified]
      let downloaded = new Map<string, string>()
      if (toDownload.length > 0) {
        indexingSetPhase('fetching', `Downloading ${toDownload.length} changed files…`)
        downloaded = await fetchBlobContents(
          owner, repo, defaultBranch, toDownload, token,
          (label) => indexingSetPhase('fetching', label),
          abortCtrl.signal,
        )
      }
      if (abortCtrl.signal.aborted) { log.warn('aborted after download'); setLoading(false); return null }

      // 6. Merge into the current file set (new-tree order → deleted files drop out)
      const files: RepoFile[] = blobs.map((b) => {
        let content = downloaded.get(b.path)
        if (content === undefined) {
          const from = renameToFrom.get(b.path)
          content = from ? cachedByPath.get(from) : cachedByPath.get(b.path)
        }
        if (content === undefined) content = ''
        return { path: b.path, content, language: detectLanguage(b.path).name, sizeBytes: content.length }
      })
      log.log(`merged ${files.length} files (${downloaded.size} downloaded, rest from cache)`)

      // 7. Parse dependencies → graph (cheap regex over the full merged set)
      indexingSetPhase('parsing', 'Parsing dependencies…')
      const rawEdges = buildEdges(files)
      const externalPackages = parseManifests(files)
      log.log(`parsed deps: ${rawEdges.length} raw edges, ${externalPackages.length} external packages`)

      const externalNodeIds = new Set(rawEdges.filter((e) => e.external).map((e) => e.target))

      const nodes: DepNode[] = [
        ...files.map((f): DepNode => {
          const langInfo = detectLanguage(f.path)
          return {
            id: f.path,
            label: f.path.split('/').pop() ?? f.path,
            type: 'internal',
            language: f.language,
            color: langInfo.color,
            path: f.path,
          }
        }),
        ...[...externalNodeIds].map((pkgId): DepNode => {
          const pkgName = pkgId.replace('pkg:', '')
          const found = externalPackages.find((p) => p.name === pkgName)
          return {
            id: pkgId,
            label: pkgName,
            type: 'external',
            language: found?.ecosystem ?? 'package',
            color: '#4a5568',
            packageName: pkgName,
          }
        }),
      ]

      const edges: DepEdge[] = rawEdges.map((e, i): DepEdge => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
      }))

      const graph: RepoGraph = { nodes, edges }
      const internalCount = nodes.filter((n) => n.type === 'internal').length
      log.log(`graph built: ${nodes.length} nodes (${internalCount} internal, ` +
        `${nodes.length - internalCount} external), ${edges.length} edges`)
      if (nodes.length > 1500) {
        log.warn(`large graph (${nodes.length} nodes) — render may be slow`)
      }

      const languageSet = new Set(files.map((f) => f.language).filter((l) => l !== 'Unknown'))
      const meta = buildRepoMeta(owner, repo, defaultBranch, [...languageSet], files.length)

      // 8. Persist repo files/graph. The manifest is saved by the caller only
      // after indexing (chunk+embed) actually succeeds — see useRepoExplorer —
      // so a crash mid-embed can't mark unembedded content as "already seen".
      indexingSetPhase('embedding', 'Saving to storage…')
      await saveRepo(meta, files, graph)

      indexingFinish()
      setLoading(false)
      done()
      return { meta, files, graph, diff, shaByPath: manifest.files, manifest }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log.error(`fetchRepo failed: ${msg}`, err)
      const userMsg =
        msg === 'AUTH_REQUIRED' ? 'Private repo or rate limit. Add a GitHub token.' :
        msg === 'REPO_NOT_FOUND' ? 'Repository not found. Check the URL.' :
        msg === 'RATE_LIMITED' ? 'GitHub rate limit hit. Add a GitHub token to increase limits.' :
        msg
      setError(userMsg)
      indexingSetError(userMsg)
      setLoading(false)
      return null
    }
  }, [indexingStart, indexingSetPhase, indexingFinish, indexingSetError])

  return { fetchRepo, loading, error }
}
