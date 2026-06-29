import { embed } from './embed'
import { getAllNodes, type KnowledgeNode } from './vectorDb'
import { bgeQueryPrefix } from './prompts'
import { createLogger } from '@/lib/logger'

const log = createLogger('rag:retrieve')

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface ScoredNode extends KnowledgeNode {
  score: number
}

export async function retrieveMulti(queries: string[], kPerQuery = 5): Promise<ScoredNode[]> {
  const batches = await Promise.all(queries.map((q) => retrieve(q, kPerQuery)))

  const seen = new Map<number, ScoredNode>()
  for (const batch of batches) {
    for (const node of batch) {
      if (node.id === undefined) continue
      const existing = seen.get(node.id)
      if (!existing || node.score > existing.score) {
        seen.set(node.id, node)
      }
    }
  }

  const merged = [...seen.values()].sort((a, b) => b.score - a.score)
  log.log(`retrieveMulti: ${queries.length} queries → ${merged.length} unique nodes`)
  return merged
}

export async function retrieve(query: string, k = 5): Promise<ScoredNode[]> {
  log.log(`query="${query.slice(0, 80)}", k=${k}`)
  // BGE models expect this prefix on queries (not on passage embeddings)
  const queryVec = await embed(bgeQueryPrefix(query))
  log.log(`query vector dim=${queryVec.length}, sample=[${queryVec.slice(0, 4).map(v => v.toFixed(4)).join(', ')}…]`)

  const allNodes = await getAllNodes()
  const nodes = allNodes.filter((n) => n.vector.length === queryVec.length)
  log.log(`total nodes in DB: ${allNodes.length} | dim-matched: ${nodes.length}`)

  if (nodes.length === 0) {
    log.warn(`no dim-matched nodes in DB — nothing to retrieve`)
    return []
  }

  // Sanity-check first node's vector
  const firstVec = nodes[0].vector
  log.log(`first node vector: type=${Array.isArray(firstVec) ? 'array' : typeof firstVec}, len=${firstVec?.length}, sample=[${firstVec?.slice(0, 4).map((v: number) => v.toFixed(4)).join(', ')}…]`)

  const scored: ScoredNode[] = nodes.map((node) => ({
    ...node,
    score: cosineSim(queryVec, node.vector),
  }))

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, k)

  log.log(`top-${k} scores:`, top.map(n => `${n.score.toFixed(4)} — "${n.text.slice(0, 60)}"`))

  return top
}
