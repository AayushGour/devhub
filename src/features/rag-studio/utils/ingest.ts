import { getEngine } from './llm'
import { embedBatch } from './embed'
import { putNode } from './vectorDb'

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 150
const LOG = '[RAG:ingest]'

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE))
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function summariseChunk(chunk: string, idx: number): Promise<string> {
  console.log(`${LOG} summarising chunk ${idx}, length=${chunk.length}`)
  const engine = await getEngine()
  try {
    const reply = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are a summarisation assistant. Write a concise 2-3 sentence summary of the passage below. Include key concepts, entities, and facts. RETURN ONLY MARKDOWN, no JSON. JUST RETURN THE SUMMARY, DO NOT SAY "Summary:" or any other text.',
        },
        { role: 'user', content: chunk },
      ],
      max_tokens: 120,
      temperature: 0,
    })
    const summary = reply.choices[0].message.content?.trim() ?? ''
    console.log(`${LOG} chunk ${idx} summary: "${summary.slice(0, 100)}…"`)
    return summary.length > 20 ? summary : chunk
  } catch (err) {
    console.warn(`${LOG} chunk ${idx} summarisation failed, using raw chunk. Error:`, err)
    return chunk
  }
}

export type IngestStatusCallback = (status: string) => void

export async function ingestFile(
  file: File,
  onStatus: IngestStatusCallback,
): Promise<void> {
  console.log(`${LOG} starting ingest for "${file.name}", size=${file.size}`)
  onStatus('reading file…')
  const text = await file.text()
  const chunks = chunkText(text)
  console.log(`${LOG} split into ${chunks.length} chunks (size=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})`)

  type Segment = { text: string; raw: string }
  const segments: Segment[] = []

  for (let i = 0; i < chunks.length; i++) {
    onStatus(`summarising chunk ${i + 1}/${chunks.length}`)
    const summary = await summariseChunk(chunks[i], i)
    // Embed both the summary (for semantic match) and the raw chunk (for exact match)
    segments.push({ text: summary, raw: chunks[i] })
    if (summary !== chunks[i]) {
      // Also embed the raw chunk directly so verbatim queries still match
      segments.push({ text: chunks[i], raw: chunks[i] })
    }
  }

  console.log(`${LOG} total segments to embed: ${segments.length}`)
  onStatus(`embedding ${segments.length} segments…`)
  const vectors = await embedBatch(
    segments.map((s) => s.text),
    (i, total) => {
      onStatus(`embedding ${i}/${total}`)
      if (i % 5 === 0) console.log(`${LOG} embedded ${i}/${total}`)
    },
  )

  console.log(`${LOG} storing ${vectors.length} nodes to IndexedDB`)
  onStatus('storing vectors…')
  for (let i = 0; i < segments.length; i++) {
    await putNode({
      text: segments[i].text,
      rawChunk: segments[i].raw,
      sourceFile: file.name,
      vector: vectors[i],
    })
  }

  console.log(`${LOG} ingest complete for "${file.name}" — ${segments.length} nodes stored`)
  onStatus('done')
}
