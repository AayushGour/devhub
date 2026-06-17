import { complete } from './llm'
import { queryExpansionPrompt, contextAwareExpansionPrompt } from './prompts'

const LOG = '[RAG:expand]'

function parseQuestions(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.replace(/^[\d.\-*)\s]+/, '').trim())
    .filter((l) => l.length > 10)
    .filter((l) => !l.startsWith('/') && !l.startsWith('GET ') && !l.startsWith('POST ') && !/^https?:\/\//.test(l))
    .filter((l) => /[a-zA-Z]{3,}/.test(l))
    .slice(0, 5)
}

export async function expandQuery(modelId: string, query: string): Promise<string[]> {
  console.log(`${LOG} expanding: "${query.slice(0, 80)}"`)

  const raw = await complete(
    modelId,
    [{ role: 'user', content: queryExpansionPrompt(query) }],
    { max_tokens: 150 },
  )

  const questions = parseQuestions(raw)
  console.log(`${LOG} generated ${questions.length} sub-questions:`, questions)
  return questions
}

export async function expandQueryWithContext(modelId: string, query: string, contextSnippet: string): Promise<string[]> {
  console.log(`${LOG} context-aware expanding: "${query.slice(0, 80)}"`)

  const raw = await complete(
    modelId,
    [{ role: 'user', content: contextAwareExpansionPrompt(query, contextSnippet) }],
    { max_tokens: 150 },
  )

  const questions = parseQuestions(raw)
  console.log(`${LOG} context-aware generated ${questions.length} sub-questions:`, questions)
  return questions
}

export async function routeQuery(modelId: string, query: string): Promise<'direct' | 'rag'> {
  console.log(`${LOG} routing: "${query.slice(0, 80)}"`)
  const raw = await complete(
    modelId,
    [{ role: 'user', content: `Classify the following user message. Reply ONLY with valid JSON, no explanation, no markdown.\n\nRoute to "direct" ONLY if the message is a pure greeting (hi, hello, hey), small talk (how are you), a thank you, or a question about the assistant itself.\n\nRoute to "rag" for EVERYTHING else — any question about features, documents, topics, code, implementations, comparisons, or anything that could relate to uploaded content. When in doubt, use "rag".\n\nMessage: "${query}"\n\nJSON ({"route":"direct"} or {"route":"rag"}):` }],
    { max_tokens: 20 },
  )
  const trimmed = raw.trim()
  let route: 'direct' | 'rag' = 'rag'
  try {
    const parsed = JSON.parse(trimmed.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    if (parsed.route === 'direct') route = 'direct'
  } catch {
    route = /"?route"?\s*:\s*"?direct"?/i.test(trimmed) ? 'direct' : 'rag'
  }
  console.log(`${LOG} route=${route} (raw: "${trimmed}")`)
  return route
}
