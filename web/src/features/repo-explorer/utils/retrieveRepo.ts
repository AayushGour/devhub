import { embed } from '@/lib/llm/embedRemote'
import { getChunksByRepo } from './repoDb'
import { bgeQueryPrefix } from '@/features/rag-studio/utils/prompts'
import { createLogger } from '@/lib/logger'
import type { RepoChunk } from '../types'

const log = createLogger('repo:retrieve')

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface ScoredChunk extends RepoChunk {
  score: number
}

// Absolute relevance floor. BGE-base scores a genuinely relevant passage ~0.6-0.8
// and unrelated boilerplate ~0.3-0.5, so anything under this is noise.
const MIN_SCORE = 0.5
// Relative floor: drop hits far weaker than the best one, so a sharp query cites
// only its few strong matches instead of always padding out to k.
const REL_SCORE = 0.85

// Embed the query and brute-force cosine over this repo's chunk vectors.
// Adequate at browser scale (thousands of chunks); no ANN index.
export async function retrieveRepo(repoKeyStr: string, query: string, k = 6): Promise<ScoredChunk[]> {
  // BGE expects this prefix on queries (not on passage embeddings).
  const queryVec = await embed(bgeQueryPrefix(query))
  const all = await getChunksByRepo(repoKeyStr)
  const chunks = all.filter((c) => c.vector.length === queryVec.length)
  log.log(`retrieve "${query.slice(0, 60)}" — ${all.length} chunks (${chunks.length} dim-matched)`)
  if (chunks.length === 0) return []

  const scored: ScoredChunk[] = chunks.map((c) => ({ ...c, score: cosineSim(queryVec, c.vector) }))
  scored.sort((a, b) => b.score - a.score)

  // Cut on relevance, not just rank — otherwise every answer cites exactly k chunks.
  const best = scored[0].score
  const top = scored
    .filter((c) => c.score >= MIN_SCORE && c.score >= best * REL_SCORE)
    .slice(0, k)

  log.log(`kept ${top.length}/${k} (best ${best.toFixed(3)}, floor ${Math.max(MIN_SCORE, best * REL_SCORE).toFixed(3)}): ` +
    top.map((c) => `${c.path}:${c.startLine} (${c.score.toFixed(3)})`).join(', '))
  return top
}
