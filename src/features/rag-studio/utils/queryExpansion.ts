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

export async function expandQuery(query: string): Promise<string[]> {
  console.log(`${LOG} expanding: "${query.slice(0, 80)}"`)

  const raw = await complete(
    [{ role: 'user', content: queryExpansionPrompt(query) }],
    { max_tokens: 150 },
  )

  const questions = parseQuestions(raw)
  console.log(`${LOG} generated ${questions.length} sub-questions:`, questions)
  return questions
}

export async function expandQueryWithContext(query: string, contextSnippet: string): Promise<string[]> {
  console.log(`${LOG} context-aware expanding: "${query.slice(0, 80)}"`)

  const raw = await complete(
    [{ role: 'user', content: contextAwareExpansionPrompt(query, contextSnippet) }],
    { max_tokens: 150 },
  )

  const questions = parseQuestions(raw)
  console.log(`${LOG} context-aware generated ${questions.length} sub-questions:`, questions)
  return questions
}
