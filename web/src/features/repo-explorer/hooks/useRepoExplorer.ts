import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGitHubFetcher } from './useGitHubFetcher'
import { useIndexer } from './useIndexer'
import { useWikiGen } from './useWikiGen'
import { useRepoChat } from './useRepoChat'
import { loadRepo, listRepos, deleteRepo, loadManifest, saveManifest, withRepoLock, getIndexedPaths, repoKey } from '../utils/repoDb'
import { buildManifestFromFiles } from '../utils/diffTree'
import { parseGitHubUrl } from '../utils/githubApi'
import { createLogger } from '@/lib/logger'
import type { RepoFile, RepoGraph, RepoMeta, TreeDiff, Citation } from '../types'

export { type ChatMessage } from './useRepoChat'

const log = createLogger('repo:explorer')

export interface RevealRange { startLine: number; endLine: number }

export function useRepoExplorer() {
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [files, setFiles] = useState<RepoFile[]>([])
  const [graph, setGraph] = useState<RepoGraph>({ nodes: [], edges: [] })
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null)
  const [revealRange, setRevealRange] = useState<RevealRange | null>(null)
  const [savedToken, setSavedToken] = useState<string | undefined>(undefined)
  const [indexedRepos, setIndexedRepos] = useState<RepoMeta[]>([])

  const refreshIndexedRepos = useCallback(async () => {
    const repos = await listRepos()
    repos.sort((a, b) => b.fetchedAt - a.fetchedAt)
    log.log(`indexed repos: ${repos.length}`)
    setIndexedRepos(repos)
  }, [])

  useEffect(() => {
    refreshIndexedRepos()
  }, [refreshIndexedRepos])

  const { fetchRepo, loading: fetching, error: fetchError } = useGitHubFetcher()
  const { indexRepo } = useIndexer()
  const { generateWiki, wikiPages, generating } = useWikiGen()
  const chat = useRepoChat(meta)

  const loadExistingRepo = useCallback(async (owner: string, repo: string) => {
    const done = log.time(`loadExistingRepo ${owner}/${repo}`)
    const stored = await loadRepo(owner, repo)
    if (!stored) {
      log.log(`no cached repo for ${owner}/${repo} — will fetch`)
      return false
    }
    log.log(`cache hit ${owner}/${repo}: ${stored.files.length} files, ` +
      `${stored.graph.nodes.length} nodes, ${stored.graph.edges.length} edges`)
    setMeta(stored.meta)
    setFiles(stored.files)
    setGraph(stored.graph)

    // Serialize against any concurrent fetch/index for this repo (other tab,
    // double-click) so we never diff/embed against a manifest another run is
    // about to overwrite.
    await withRepoLock(owner, repo, async () => {
      // v1→v2 migration / incomplete index: find files with no persisted
      // chunk at all and (re-)embed only those, from cached content, no
      // network. Checking per-file (not a repo-wide "any chunks?" boolean)
      // matters because this is also the resume path for a network fetch
      // that got interrupted mid-embed (e.g. a page refresh) — some files
      // may already be fully embedded, and a boolean check would skip
      // re-indexing entirely and leave the rest permanently un-embedded.
      const indexedPaths = await getIndexedPaths(repoKey(owner, repo))
      const missing = stored.files.filter((f) => !indexedPaths.has(f.path))
      if (missing.length > 0) {
        log.log(`${missing.length}/${stored.files.length} files missing chunks for ${owner}/${repo} — indexing them`)
        const fullDiff: TreeDiff = {
          added: missing.map((f) => f.path),
          modified: [], deleted: [], renamed: [], unchanged: [],
        }
        // Reuse a real manifest if one exists; otherwise synthesize content
        // hashes and persist them now — leaving this unsaved is what caused
        // every subsequent real fetch to re-embed (and duplicate) everything.
        let manifest = await loadManifest(owner, repo)
        if (!manifest) {
          manifest = await buildManifestFromFiles(stored.files)
          await saveManifest(owner, repo, manifest)
        }
        await indexRepo(owner, repo, stored.files, fullDiff, manifest.files)
      }
    })
    done()
    return true
  }, [indexRepo])

  const runFetch = useCallback(async (url: string, token?: string) => {
    const done = log.time(`runFetch ${url}`)
    log.log(`fetching ${url}${token ? ' (with token)' : ''}`)

    const run = async () => {
      const data = await fetchRepo(url, token)
      if (!data) {
        log.warn(`fetch returned no data for ${url}`)
        return
      }
      log.log(`fetched ${data.meta.owner}/${data.meta.repo}: ${data.files.length} files`)

      setMeta(data.meta)
      setFiles(data.files)
      setGraph(data.graph)
      setSelectedFile(null)
      setRevealRange(null)

      await new Promise<void>((r) => setTimeout(r, 0))
      await indexRepo(data.meta.owner, data.meta.repo, data.files, data.diff, data.shaByPath)
      // Only mark this content as "seen" once it's actually embedded — if
      // indexRepo throws above, the manifest stays at its prior value and the
      // next attempt correctly re-diffs the same files instead of skipping them.
      await saveManifest(data.meta.owner, data.meta.repo, data.manifest)
      await refreshIndexedRepos()
    }

    // Lock by parsed owner/repo, not data.meta (not known until after fetch),
    // so a second concurrent call for the same repo waits instead of racing.
    const parsed = parseGitHubUrl(url)
    await (parsed ? withRepoLock(parsed.owner, parsed.repo, run) : run())
    done()
  }, [fetchRepo, indexRepo, refreshIndexedRepos])

  const handleFetch = useCallback(async (url: string, token?: string) => {
    log.log(`handleFetch: ${url}`)
    setSavedToken(token)

    const parsed = url.match(/github\.com\/([^/]+)\/([^/?\s#]+)/)
    if (parsed) {
      const [, owner, repo] = parsed
      const loaded = await loadExistingRepo(owner, repo.replace(/\.git$/, ''))
      if (loaded) return
    }

    await runFetch(url, token)
  }, [runFetch, loadExistingRepo])

  const handleRefetch = useCallback(async () => {
    if (!meta) return
    await runFetch(meta.url, savedToken)
  }, [meta, savedToken, runFetch])

  const handleDeleteRepo = useCallback(async (owner: string, repo: string) => {
    log.log(`delete indexed repo: ${owner}/${repo}`)
    await deleteRepo(owner, repo)
    await refreshIndexedRepos()
  }, [refreshIndexedRepos])

  const handleSelectFile = useCallback((file: RepoFile) => {
    log.log(`select file: ${file.path}`)
    setRevealRange(null)
    setSelectedFile(file)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedFile(null)
    setRevealRange(null)
  }, [])

  const handleGenerateWiki = useCallback((file: RepoFile) => {
    if (!meta) return
    generateWiki(meta.owner, meta.repo, file)
  }, [meta, generateWiki])

  const fileMap = useMemo(() => new Map(files.map((f) => [f.path, f])), [files])

  const handleNodeClick = useCallback((path: string) => {
    const file = fileMap.get(path)
    if (file) { setRevealRange(null); setSelectedFile(file) }
  }, [fileMap])

  // Open a chat citation: show the file in the panel and reveal the cited lines.
  const handleOpenCitation = useCallback((c: Citation) => {
    const file = fileMap.get(c.path)
    if (!file) { log.warn(`citation target not in file set: ${c.path}`); return }
    setSelectedFile(file)
    setRevealRange({ startLine: c.startLine, endLine: c.endLine })
  }, [fileMap])

  return {
    meta, files, graph, selectedFile, revealRange,
    fetching, fetchError,
    wikiPages, generating,
    chat,
    indexedRepos,
    handleFetch,
    handleRefetch,
    handleDeleteRepo,
    handleSelectFile,
    handleClosePanel,
    handleGenerateWiki,
    handleNodeClick,
    handleOpenCitation,
  }
}
