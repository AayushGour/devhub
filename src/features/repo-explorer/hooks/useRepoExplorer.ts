import { useCallback, useMemo, useState } from 'react'
import { useGitHubFetcher } from './useGitHubFetcher'
import { useIndexer } from './useIndexer'
import { useWikiGen } from './useWikiGen'
import { useRepoChat } from './useRepoChat'
import { loadRepo } from '../utils/repoDb'
import type { RepoFile, RepoGraph, RepoMeta, ExplorerView } from '../types'

export { type ChatMessage } from './useRepoChat'

export function useRepoExplorer() {
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [files, setFiles] = useState<RepoFile[]>([])
  const [graph, setGraph] = useState<RepoGraph>({ nodes: [], edges: [] })
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null)
  const [view, setView] = useState<ExplorerView>('graph')
  const [savedToken, setSavedToken] = useState<string | undefined>(undefined)

  const { fetchRepo, loading: fetching, error: fetchError } = useGitHubFetcher()
  const { indexFiles, loadIndex, embeddings } = useIndexer()
  const { generateWiki, wikiPages, generating } = useWikiGen()
  const chat = useRepoChat(meta, files, embeddings)

  const loadExistingRepo = useCallback(async (owner: string, repo: string) => {
    const stored = await loadRepo(owner, repo)
    if (!stored) return false
    setMeta(stored.meta)
    setFiles(stored.files)
    setGraph(stored.graph)
    await loadIndex(owner, repo)
    return true
  }, [loadIndex])

  const runFetch = useCallback(async (url: string, token?: string) => {
    const data = await fetchRepo(url, token)
    if (!data) return

    setMeta(data.meta)
    setFiles(data.files)
    setGraph(data.graph)
    setSelectedFile(null)

    await new Promise<void>((r) => setTimeout(r, 0))
    await indexFiles(data.meta.owner, data.meta.repo, data.files)
  }, [fetchRepo, indexFiles])

  const handleFetch = useCallback(async (url: string, token?: string) => {
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

  const handleSelectFile = useCallback((file: RepoFile) => {
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
    meta, files, graph, selectedFile, view, setView,
    fetching, fetchError,
    embeddings,
    wikiPages, generating,
    chat,
    handleFetch,
    handleRefetch,
    handleSelectFile,
    handleClosePanel,
    handleGenerateWiki,
    handleNodeClick,
  }
}
