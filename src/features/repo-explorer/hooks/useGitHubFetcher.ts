import { useCallback, useState } from 'react'
import { parseGitHubUrl, fetchRepoMeta, fetchRepoFiles, buildRepoMeta } from '../utils/githubApi'
import { detectLanguage } from '../utils/languageDetect'
import { buildEdges } from '../utils/depParsers'
import { parseManifests } from '../utils/packageParsers'
import { saveRepo } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import type { RepoFile, DepNode, DepEdge, RepoGraph, RepoIndexedData } from '../types'

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
  ): Promise<RepoIndexedData | null> => {
    setLoading(true)
    setError(null)

    const parsed = parseGitHubUrl(url)
    if (!parsed) {
      setError('Invalid GitHub URL. Expected: https://github.com/owner/repo')
      setLoading(false)
      return null
    }

    const { owner, repo } = parsed
    const abortCtrl = new AbortController()
    indexingStart(`Fetching ${owner}/${repo}`, () => abortCtrl.abort())

    try {
      // 1. Repo metadata
      indexingSetPhase('fetching', `Connecting to ${owner}/${repo}…`)
      const { defaultBranch } = await fetchRepoMeta(owner, repo, token)

      if (abortCtrl.signal.aborted) { setLoading(false); return null }

      // 2. Download files via Trees API + raw content (CORS-safe)
      indexingSetPhase('fetching', 'Downloading repository…')
      const contentMap = await fetchRepoFiles(
        owner, repo, defaultBranch, token,
        (label) => indexingSetPhase('fetching', label),
        abortCtrl.signal,
      )

      if (abortCtrl.signal.aborted) { setLoading(false); return null }

      // 3. Build RepoFile array
      const files: RepoFile[] = []
      for (const [path, content] of contentMap) {
        const lang = detectLanguage(path)
        files.push({ path, content, language: lang.name, sizeBytes: content.length })
      }

      // 4. Parse dependencies
      indexingSetPhase('parsing', 'Parsing dependencies…')
      const rawEdges = buildEdges(files)
      const externalPackages = parseManifests(files)

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

      const languageSet = new Set(files.map((f) => f.language).filter((l) => l !== 'Unknown'))
      const meta = buildRepoMeta(owner, repo, defaultBranch, [...languageSet], files.length)

      // 5. Save to IndexedDB
      indexingSetPhase('embedding', 'Saving to storage…')
      await saveRepo(meta, files, graph)

      indexingFinish()
      setLoading(false)
      return { meta, files, graph }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
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
