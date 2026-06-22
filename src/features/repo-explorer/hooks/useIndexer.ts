import { useCallback, useState } from 'react'
import { getEmbedder } from '@/features/rag-studio/utils/embed'
import { embed } from '@/features/rag-studio/utils/embed'
import { saveEmbeddings, loadEmbeddings } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import { createLogger } from '@/lib/logger'
import type { RepoFile } from '../types'

const log = createLogger('repo:index')

export function useIndexer() {
  const [embeddings, setEmbeddings] = useState<Map<string, number[]>>(new Map())
  // Select actions individually (stable refs) — never subscribe to the whole
  // store, or every progress tick would re-render this hook's consumers.
  const start = useIndexingStore((s) => s.start)
  const setPhase = useIndexingStore((s) => s.setPhase)
  const setProgress = useIndexingStore((s) => s.setProgress)
  const finish = useIndexingStore((s) => s.finish)

  const loadIndex = useCallback(async (owner: string, repo: string): Promise<boolean> => {
    const stored = await loadEmbeddings(owner, repo)
    if (!stored) {
      log.log(`no cached embeddings for ${owner}/${repo}`)
      return false
    }
    log.log(`loaded ${stored.size} cached embeddings for ${owner}/${repo}`)
    setEmbeddings(stored)
    return true
  }, [])

  const indexFiles = useCallback(async (
    owner: string,
    repo: string,
    files: RepoFile[],
  ): Promise<Map<string, number[]>> => {
    const done = log.time(`indexFiles ${owner}/${repo}`)
    log.log(`indexing ${files.length} files`)
    start('Indexing files', () => {})

    // Boot embedder (downloads model on first run, cached after)
    const embDone = log.time('boot embedder')
    await getEmbedder((pct) => {
      setProgress(pct, 100)
    })
    embDone()

    setPhase('embedding', 'Embedding files…')

    const result = new Map<string, number[]>()
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Use first 1500 chars for embedding (matches RAG chunk size)
      const text = `File: ${file.path}\n\n${file.content.slice(0, 1500)}`
      try {
        const vec = await embed(text)
        result.set(file.path, vec)
      } catch (err) {
        // skip files that fail to embed
        failed++
        log.warn(`embed failed for ${file.path}`, err)
      }
      setProgress(i + 1, files.length)
    }

    await saveEmbeddings(owner, repo, result)
    setEmbeddings(result)
    finish()
    done(`${result.size} embedded, ${failed} failed`)
    return result
  }, [start, setPhase, setProgress, finish])

  return { indexFiles, loadIndex, embeddings }
}
