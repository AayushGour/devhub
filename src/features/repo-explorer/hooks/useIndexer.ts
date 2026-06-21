import { useCallback, useState } from 'react'
import { getEmbedder, embed } from '@/lib/llm/embed'
import { saveEmbeddings, loadEmbeddings } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import type { RepoFile } from '../types'

export function useIndexer() {
  const [embeddings, setEmbeddings] = useState<Map<string, number[]>>(new Map())
  const indexing = useIndexingStore()

  const loadIndex = useCallback(async (owner: string, repo: string): Promise<boolean> => {
    const stored = await loadEmbeddings(owner, repo)
    if (!stored) return false
    setEmbeddings(stored)
    return true
  }, [])

  const indexFiles = useCallback(async (
    owner: string,
    repo: string,
    files: RepoFile[],
  ): Promise<Map<string, number[]>> => {
    indexing.start('Indexing files', () => {})

    // Boot embedder (downloads model on first run, cached after)
    await getEmbedder((pct) => {
      indexing.setProgress(pct, 100)
    })

    indexing.setPhase('embedding', 'Embedding files…')

    const result = new Map<string, number[]>()
    for (let i = 0; i < files.length; i++) {
      // Yield to main thread every 5 files — WASM inference is synchronous and
      // will block paint if we never release the thread.
      if (i % 5 === 0) await new Promise<void>((r) => setTimeout(r, 0))

      const file = files[i]
      const text = `File: ${file.path}\n\n${file.content.slice(0, 1500)}`
      try {
        const vec = await embed(text)
        result.set(file.path, vec)
      } catch {
        // skip files that fail to embed
      }
      indexing.setProgress(i + 1, files.length)
    }

    await saveEmbeddings(owner, repo, result)
    setEmbeddings(result)
    indexing.finish()
    return result
  }, [indexing])

  return { indexFiles, loadIndex, embeddings }
}
