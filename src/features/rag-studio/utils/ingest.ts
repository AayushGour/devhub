import { getEngine } from './llm'
import { embedBatch } from './embed'
import { putNode } from './vectorDb'
import { extractText } from './extractText'
import { chunkSummarisationSystemPrompt } from './prompts'
import { createLogger } from '@/lib/logger'

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 150
const log = createLogger('rag:ingest')

interface HeadingEntry { pos: number; level: number; text: string }

function extractHeadings(text: string): HeadingEntry[] {
  const headings: HeadingEntry[] = []
  const lines = text.split('\n')
  let pos = 0
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) headings.push({ pos, level: match[1].length, text: match[2].trim() })
    pos += line.length + 1
  }
  return headings
}

function getTagsForPosition(chunkStart: number, headings: HeadingEntry[]): string[] {
  const breadcrumb = new Map<number, string>()
  for (const h of headings) {
    if (h.pos > chunkStart) break
    breadcrumb.set(h.level, h.text)
    for (const [l] of breadcrumb) {
      if (l > h.level) breadcrumb.delete(l)
    }
  }
  return [...breadcrumb.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t)
}

function chunkText(text: string): string[] {
  // Split at sentence boundaries (.!? followed by whitespace) or paragraph breaks
  const sentences = text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > CHUNK_SIZE && current.length > 0) {
      chunks.push(current)
      const overlapStart = Math.max(0, current.length - CHUNK_OVERLAP)
      current = `${current.slice(overlapStart)} ${sentence}`.trim()
    } else {
      current = next
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

async function summariseChunk(modelId: string, chunk: string, idx: number): Promise<string> {
  log.log(`summarising chunk ${idx}, length=${chunk.length}`)
  const engine = await getEngine(modelId)
  try {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: chunkSummarisationSystemPrompt },
        { role: 'user', content: chunk },
      ],
      max_tokens: 120,
      temperature: 0,
    })
    const summary = reply.choices[0].message.content?.trim() ?? ''
    log.log(`chunk ${idx} summary: "${summary.slice(0, 100)}…"`)
    return summary.length > 20 ? summary : chunk
  } catch (err) {
    log.warn(`chunk ${idx} summarisation failed, using raw chunk. Error:`, err)
    return chunk
  }
}

export type IngestStatusCallback = (status: string) => void

export async function ingestFile(
  file: File,
  modelId: string,
  onStatus: IngestStatusCallback,
): Promise<void> {
  log.log(`starting ingest for "${file.name}", size=${file.size}`)
  const text = await extractText(file, onStatus)
  if (!text.trim()) throw new Error('No extractable text found in file')
  const chunks = chunkText(text)
  const headings = extractHeadings(text)
  log.log(`split into ${chunks.length} chunks, found ${headings.length} headings`)

  type Segment = { text: string; embedText: string; raw: string; tags: string[] }
  const segments: Segment[] = []
  const STRIDE = CHUNK_SIZE - CHUNK_OVERLAP

  for (let i = 0; i < chunks.length; i++) {
    onStatus(`summarising chunk ${i + 1}/${chunks.length}`)
    const summary = await summariseChunk(modelId, chunks[i], i)
    const tags = getTagsForPosition(i * STRIDE, headings)
    const tagPrefix = tags.length > 0
      ? `[source: ${file.name} | section: ${tags.join(' > ')}]\n`
      : `[source: ${file.name}]\n`

    segments.push({ text: summary, embedText: tagPrefix + summary, raw: chunks[i], tags })
    if (summary !== chunks[i]) {
      segments.push({ text: chunks[i], embedText: tagPrefix + chunks[i], raw: chunks[i], tags })
    }
  }

  log.log(`total segments to embed: ${segments.length}`)
  onStatus(`embedding ${segments.length} segments…`)
  const vectors = await embedBatch(
    segments.map((s) => s.embedText),
    (i, total) => {
      onStatus(`embedding ${i}/${total}`)
      if (i % 5 === 0) log.log(`embedded ${i}/${total}`)
    },
  )

  log.log(`storing ${vectors.length} nodes to IndexedDB`)
  onStatus('storing vectors…')
  for (let i = 0; i < segments.length; i++) {
    await putNode({
      text: segments[i].text,
      rawChunk: segments[i].raw,
      sourceFile: file.name,
      vector: vectors[i],
      tags: segments[i].tags,
    })
  }

  log.log(`ingest complete for "${file.name}" — ${segments.length} nodes stored`)
  onStatus('done')
}
