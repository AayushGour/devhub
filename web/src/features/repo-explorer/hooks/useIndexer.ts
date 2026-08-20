import { useCallback } from 'react'
import { getEmbedder, embedBatch } from '@/lib/llm/embedRemote'
import {
  putChunks, deleteChunksByPath, renameChunkPath, hasChunkForPathSha, repoKey,
} from '../utils/repoDb'
import { chunkFiles } from '../workers/chunkClient'
import { useIndexingStore } from '@/store/indexingStore'
import { createLogger } from '@/lib/logger'
import type { RepoFile, TreeDiff } from '../types'

const log = createLogger('repo:index')

export function useIndexer() {
  // Select actions individually (stable refs) — never subscribe to the whole
  // store, or every progress tick would re-render this hook's consumers.
  const start = useIndexingStore((s) => s.start)
  const setPhase = useIndexingStore((s) => s.setPhase)
  const setProgress = useIndexingStore((s) => s.setProgress)
  const finish = useIndexingStore((s) => s.finish)
  const setError = useIndexingStore((s) => s.setError)

  // Apply a tree diff to the chunk store: purge deleted, re-key renamed, and
  // chunk + embed only the added/modified files. `shaByPath` stamps each chunk
  // with its file's content hash. Embedding + persistence happen per file
  // (not one bulk write at the end) so an interrupted run (page refresh mid-
  // index) only loses the one file in flight, and a resumed run — recomputing
  // the same diff, since the manifest only saves after this succeeds — skips
  // every file already persisted from the earlier attempt instead of
  // re-embedding the whole changed set from scratch.
  const indexRepo = useCallback(async (
    owner: string,
    repo: string,
    files: RepoFile[],
    diff: TreeDiff,
    shaByPath: Record<string, string>,
  ): Promise<void> => {
    const repoK = repoKey(owner, repo)

    // 1. Cheap structural ops — no embedding. Deletions/renames are
    // unconditional (content unchanged or gone, nothing to resume). Modified
    // files' stale chunks are purged later, per file, right before they're
    // replaced — not here — so a modified file already re-embedded in an
    // earlier attempt doesn't get its fresh chunks wiped by this step on
    // the next resume.
    for (const p of diff.deleted) await deleteChunksByPath(repoK, p)
    for (const r of diff.renamed) await renameChunkPath(repoK, r.from, r.to)

    const changed = [...diff.added, ...diff.modified]
    if (changed.length === 0) {
      log.log(`nothing to embed (deleted=${diff.deleted.length}, renamed=${diff.renamed.length})`)
      return
    }

    const modifiedSet = new Set(diff.modified)
    const done = log.time(`indexRepo ${repoK}`)
    start('Indexing files', () => {})

    try {
      // Boot embedder (downloads model on first run, cached after).
      setPhase('embedding', 'Loading embedder…')
      await getEmbedder((pct) => setProgress(pct, 100))

      // 2. Resume check — skip any file already fully embedded and persisted
      // for this exact target sha (a prior interrupted attempt at this diff).
      const alreadyDone = await Promise.all(
        changed.map((p) => hasChunkForPathSha(repoK, p, shaByPath[p] ?? '')),
      )
      const toProcess = changed.filter((_, i) => !alreadyDone[i])
      const skipped = changed.length - toProcess.length
      log.log(`indexing ${changed.length} changed files (${diff.added.length} added, ` +
        `${diff.modified.length} modified)${skipped > 0 ? ` — resuming, ${skipped} already embedded` : ''}`)

      let filesDone = skipped
      setProgress(filesDone, changed.length)

      if (toProcess.length === 0) {
        finish()
        done(`0 to process (${skipped} already embedded)`)
        return
      }

      // 3. Chunk the remaining files off-thread (tree-sitter, with line-window
      // fallback) — one batched call, chunking is cheap and not what needs
      // per-file checkpointing.
      setPhase('parsing', `Chunking ${toProcess.length} files…`)
      const fileMap = new Map(files.map((f) => [f.path, f]))
      const toChunk = toProcess
        .map((p) => fileMap.get(p))
        .filter((f): f is RepoFile => !!f)
        .map((f) => ({ path: f.path, content: f.content }))
      const chunked = await chunkFiles(toChunk)
      log.log(`chunked ${chunked.length} files`)

      // 4. Embed + persist one file at a time — a refresh mid-run loses at
      // most the file in progress, not the whole batch.
      let totalChunks = 0
      setPhase('embedding', `Embedding files… (${filesDone}/${changed.length})`)
      for (const cf of chunked) {
        if (modifiedSet.has(cf.path)) await deleteChunksByPath(repoK, cf.path)

        if (cf.chunks.length > 0) {
          const texts = cf.chunks.map((c) => `${cf.path} (L${c.startLine}-${c.endLine})\n\n${c.text}`)
          const vectors = await embedBatch(texts)
          const rows = cf.chunks.map((c, i) => ({
            repoKey: repoK,
            path: cf.path,
            blobSha: shaByPath[cf.path] ?? '',
            startLine: c.startLine,
            endLine: c.endLine,
            text: c.text,
            vector: vectors[i],
          }))
          await putChunks(rows)
          totalChunks += rows.length
        }

        filesDone++
        setProgress(filesDone, changed.length)
        setPhase('embedding', `Embedding files… (${filesDone}/${changed.length})`)
      }

      finish()
      done(`${totalChunks} chunks embedded across ${toProcess.length} files (${skipped} already done)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log.error(`indexRepo failed: ${msg}`, err)
      setError(msg)
      throw err
    }
  }, [start, setPhase, setProgress, finish, setError])

  return { indexRepo }
}
