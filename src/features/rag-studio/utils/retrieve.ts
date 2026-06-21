import { embed } from '@/lib/llm/embed'
import { getAllNodes, type KnowledgeNode } from './vectorDb'
import { bgeQueryPrefix } from './prompts'

const LOG = '[RAG:retrieve]'

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
  console.log(`${LOG} retrieveMulti: ${queries.length} queries → ${merged.length} unique nodes`)
  return merged
}

export async function retrieve(query: string, k = 5): Promise<ScoredNode[]> {
  console.log(`${LOG} query="${query.slice(0, 80)}", k=${k}`)
  // BGE models expect this prefix on queries (not on passage embeddings)
  const queryVec = await embed(bgeQueryPrefix(query))
  console.log(`${LOG} query vector dim=${queryVec.length}, sample=[${queryVec.slice(0, 4).map(v => v.toFixed(4)).join(', ')}…]`)

  const allNodes = await getAllNodes()
  const nodes = allNodes.filter((n) => n.vector.length === queryVec.length)
  console.log(`${LOG} total nodes in DB: ${allNodes.length} | dim-matched: ${nodes.length}`)

  if (nodes.length === 0) {
    console.warn(`${LOG} no dim-matched nodes in DB — nothing to retrieve`)
    return []
  }

  // Sanity-check first node's vector
  const firstVec = nodes[0].vector
  console.log(`${LOG} first node vector: type=${Array.isArray(firstVec) ? 'array' : typeof firstVec}, len=${firstVec?.length}, sample=[${firstVec?.slice(0, 4).map((v: number) => v.toFixed(4)).join(', ')}…]`)

  const scored: ScoredNode[] = nodes.map((node) => ({
    ...node,
    score: cosineSim(queryVec, node.vector),
  }))

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, k)

  console.log(`${LOG} top-${k} scores:`, top.map(n => `${n.score.toFixed(4)} — "${n.text.slice(0, 60)}"`))

  return top
}
