export function bgeQueryPrefix(query: string): string {
  return `Represent this sentence for searching relevant passages: ${query}`
}

export const chunkSummarisationSystemPrompt =
  'You are a summarisation assistant. Write a concise 2-3 sentence summary of the passage below. Include key concepts, entities, and facts. RETURN ONLY MARKDOWN, no JSON. JUST RETURN THE SUMMARY, DO NOT SAY "Summary:" or any other text like "the passage highlights..", etc.'

export function queryExpansionPrompt(query: string): string {
  return `Question: ${query}

Write 5 natural language questions that would help find information to answer the question above. Each must be a complete English sentence ending with a question mark. Do NOT output API paths, code, URLs, or technical notation — only plain English questions. Output only the 5 questions, one per line, nothing else.

Questions:`
}

export function contextAwareExpansionPrompt(query: string, contextSnippet: string): string {
  return `Document excerpts:
${contextSnippet}

Original question: ${query}

Using the document excerpts above as background, write 5 natural language questions that would help find more information to answer the original question. Each question must be a complete English sentence ending with a question mark. Do NOT output API paths, code, URLs, or technical notation — only plain English questions.

Example of correct output:
How does the system handle authentication for cluster access?
What are the different states a pod can be in?

Output only the 5 questions, one per line, nothing else.

Questions:`
}

export function routingExpansionPrompt(query: string): string {
  return `Query: ${query}

Is this query conversational (greeting, small talk, general knowledge that does not require searching uploaded documents), or does it need document lookup?

If CONVERSATIONAL, output exactly:
ROUTE: direct
ANSWER: <your response>

If needs DOCUMENTS, output exactly:
ROUTE: rag
QUESTIONS:
<up to 5 plain English questions to retrieve relevant document passages, one per line>

Output nothing else.`
}

export function routingExpansionWithContextPrompt(query: string, contextSnippet: string): string {
  return `Document excerpts:
${contextSnippet}

Query: ${query}

Is this query conversational (greeting, small talk, general knowledge that does not require these specific documents), or does it need document lookup?

If CONVERSATIONAL, output exactly:
ROUTE: direct
ANSWER: <your response>

If needs DOCUMENTS, output exactly:
ROUTE: rag
QUESTIONS:
<up to 5 plain English questions to retrieve relevant document passages, one per line>

Output nothing else.`
}

export function ragSystemPrompt(contextBlock: string): string {
  return `You are a helpful assistant. Answer the user's question using ONLY the context below.\nIf the answer is not in the context, say "I couldn't find that in the uploaded documents."\n\n=== CONTEXT ===\n${contextBlock.trim()}\n=== END CONTEXT ===. Do not add any phrases like "based on the context..." or "according to the documents...". Just answer the question directly.`
}

export const noDocsSystemPrompt =
  `You are a helpful assistant. The user has not uploaded any documents yet. Let them know they can drop .txt or .md files on the left panel.`
