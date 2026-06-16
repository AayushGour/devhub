import { getEngine } from './llm'
import { embedBatch } from './embed'
import { putNode } from './vectorDb'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100
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

interface ExtractedChunk {
  entities: Array<{ name: string; type: string; description: string }>
  summary: string
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'type', 'description'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['entities', 'summary'],
}

async function extractChunk(chunk: string, idx: number): Promise<ExtractedChunk> {
  console.log(`${LOG} extracting chunk ${idx}, length=${chunk.length}`)
  const engine = await getEngine()
  let raw = ''
  try {
    const reply = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are an information extraction agent. Extract entities and write a summary. Respond ONLY with valid JSON matching the provided schema. No extra text.',
        },
        { role: 'user', content: `Extract from this text:\n\n${chunk}` },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { schema: EXTRACTION_SCHEMA },
      } as never,
    })
    raw = reply.choices[0].message.content ?? ''
    console.log(`${LOG} chunk ${idx} LLM raw response:`, raw.slice(0, 200))
    // Strip markdown code fences — LLM often wraps JSON in ```json ... ``` despite instructions
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    console.log(`${LOG} chunk ${idx} cleaned:`, cleaned.slice(0, 200))
    const parsed = JSON.parse(cleaned) as ExtractedChunk
    console.log(`${LOG} chunk ${idx} extracted: summary="${parsed.summary?.slice(0, 80)}…", entities=${parsed.entities?.length ?? 0}`)
    return parsed
  } catch (err) {
    console.warn(`${LOG} chunk ${idx} extraction failed (raw="${raw.slice(0, 100)}"), falling back to raw chunk. Error:`, err)
    // Fall back to full chunk text — not just 200 chars — so embedding covers all content
    return { entities: [], summary: chunk }
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
    onStatus(`extracting chunk ${i + 1}/${chunks.length}`)
    const extracted = await extractChunk(chunks[i], i)

    // Always use the full chunk as raw; use summary for embedding text if available
    const embedText = extracted.summary && extracted.summary.length > 50
      ? extracted.summary
      : chunks[i]  // fall back to full chunk, not 200-char slice

    segments.push({ text: embedText, raw: chunks[i] })

    for (const entity of extracted.entities) {
      segments.push({
        text: `${entity.name} (${entity.type}): ${entity.description}`,
        raw: chunks[i],
      })
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
