import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGitHubFetcher } from './useGitHubFetcher'
import { useIndexer } from './useIndexer'
import { useWikiGen } from './useWikiGen'
import { useRepoChat } from './useRepoChat'
import { loadRepo, listRepos, deleteRepo } from '../utils/repoDb'
import { createLogger } from '@/lib/logger'
import type { RepoFile, RepoGraph, RepoMeta } from '../types'

export { type ChatMessage } from './useRepoChat'

const log = createLogger('repo:explorer')

export function useRepoExplorer() {
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [files, setFiles] = useState<RepoFile[]>([])
  const [graph, setGraph] = useState<RepoGraph>({ nodes: [], edges: [] })
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null)
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
  const { indexFiles, loadIndex, embeddings } = useIndexer()
  const { generateWiki, wikiPages, generating } = useWikiGen()
  const chat = useRepoChat(meta, files, embeddings)

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
    await loadIndex(owner, repo)
    done()
    return true
  }, [loadIndex])

  const runFetch = useCallback(async (url: string, token?: string) => {
    const done = log.time(`runFetch ${url}`)
    log.log(`fetching ${url}${token ? ' (with token)' : ''}`)
    const data = await fetchRepo(url, token)
    if (!data) {
      log.warn(`fetch returned no data for ${url}`)
      return
    }
    log.log(`fetched ${data.meta.owner}/${data.meta.repo}: ${data.files.length} files, ` +
      `${data.graph.nodes.length} nodes, ${data.graph.edges.length} edges`)

    setMeta(data.meta)
    setFiles(data.files)
    setGraph(data.graph)
    setSelectedFile(null)

    await new Promise<void>((r) => setTimeout(r, 0))
    await indexFiles(data.meta.owner, data.meta.repo, data.files)
    await refreshIndexedRepos()
    done()
  }, [fetchRepo, indexFiles, refreshIndexedRepos])

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
    setSelectedFile(file)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedFile(null)
  }, [])

  const handleGenerateWiki = useCallback((file: RepoFile) => {
    if (!meta) return
    generateWiki(meta.owner, meta.repo, file)
  }, [meta, generateWiki])

  const fileMap = useMemo(() => new Map(files.map((f) => [f.path, f])), [files])

  const handleNodeClick = useCallback((path: string) => {
    const file = fileMap.get(path)
    if (file) setSelectedFile(file)
  }, [fileMap])

  return {
    meta, files, graph, selectedFile,
    fetching, fetchError,
    embeddings,
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
  }
}
