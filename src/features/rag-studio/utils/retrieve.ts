import { embed } from './embed'
import { getAllNodes, type KnowledgeNode } from './vectorDb'

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

export async function retrieve(query: string, k = 5): Promise<ScoredNode[]> {
  console.log(`${LOG} query="${query.slice(0, 80)}", k=${k}`)
  const queryVec = await embed(query)
  console.log(`${LOG} query vector dim=${queryVec.length}, sample=[${queryVec.slice(0, 4).map(v => v.toFixed(4)).join(', ')}…]`)

  const nodes = await getAllNodes()
  console.log(`${LOG} total nodes in DB: ${nodes.length}`)

  if (nodes.length === 0) {
    console.warn(`${LOG} no nodes in DB — nothing to retrieve`)
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
