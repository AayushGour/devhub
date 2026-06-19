import { useCallback, useState } from 'react'
import { parseGitHubUrl, fetchRepoMeta, fetchRepoTree, fetchFilesBatched, buildRepoMeta } from '../utils/githubApi'
import { isBinary, detectLanguage } from '../utils/languageDetect'
import { buildEdges } from '../utils/depParsers'
import { parseManifests } from '../utils/packageParsers'
import { saveRepo } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import type { RepoFile, DepNode, DepEdge, RepoGraph, RepoIndexedData } from '../types'

export function useGitHubFetcher() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const indexing = useIndexingStore()

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
    indexing.start(`Fetching ${owner}/${repo}`, () => abortCtrl.abort())

    try {
      // 1. Repo metadata
      indexing.setPhase('fetching', `Fetching ${owner}/${repo} metadata…`)
      const { defaultBranch } = await fetchRepoMeta(owner, repo, token)

      // 2. File tree
      indexing.setPhase('fetching', `Scanning file tree…`)
      const treeItems = await fetchRepoTree(owner, repo, defaultBranch, token)

      // Filter binaries
      const textItems = treeItems.filter((item) => !isBinary(item.path))

      if (textItems.length > 500) {
        indexing.setPhase('fetching', `Large repo: fetching ${textItems.length} files…`)
      }

      const paths = textItems.map((i) => i.path)

      // 3. Fetch file contents
      indexing.setPhase('fetching', `Fetching file contents…`)
      const contentMap = await fetchFilesBatched(
        owner, repo, paths, token,
        (done, total) => {
          indexing.setProgress(done, total)
        },
        abortCtrl.signal,
      )

      if (abortCtrl.signal.aborted) {
        setLoading(false)
        return null
      }

      // 4. Build RepoFile array
      const files: RepoFile[] = []
      for (const [path, content] of contentMap) {
        if (!content) continue
        const lang = detectLanguage(path)
        files.push({
          path,
          content,
          language: lang.name,
          sizeBytes: content.length,
        })
      }

      // 5. Parse dependencies
      indexing.setPhase('parsing', 'Parsing dependencies…')
      const rawEdges = buildEdges(files)
      const externalPackages = parseManifests(files)

      // Build graph
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

      // 6. Determine languages
      const languageSet = new Set(files.map((f) => f.language).filter((l) => l !== 'Unknown'))
      const languages = [...languageSet]

      // 7. Build meta
      const meta = buildRepoMeta(owner, repo, defaultBranch, languages, files.length, token)

      // 8. Save to IndexedDB
      indexing.setPhase('embedding', 'Saving to storage…')
      await saveRepo(meta, files, graph)

      indexing.finish()
      setLoading(false)

      return { meta, files, graph }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg === 'AUTH_REQUIRED') {
        setError('Private repo or rate limit. Add a GitHub token in the input.')
      } else if (msg === 'REPO_NOT_FOUND') {
        setError('Repository not found. Check the URL.')
      } else {
        setError(msg)
      }
      indexing.setError(msg)
      setLoading(false)
      return null
    }
  }, [indexing])

  return { fetchRepo, loading, error }
}
