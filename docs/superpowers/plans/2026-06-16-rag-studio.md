# RAG Studio Implementation Plan (DevHub Integration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "RAG Studio" tool to DevHub — a 100% browser-native document Q&A chat that ingests .txt/.md files, extracts/embeds content via WebLLM + Transformers.js, stores vectors in IndexedDB, and answers questions with streamed responses — no server required.

**Architecture:** Feature folder `src/features/rag-studio/` following devhub's existing two-pane pattern. Left panel = document management (dropzone + doc list). Right panel = chat interface. Shared state via a `useRagEngine` hook. A full-screen overlay handles model download progress. WebLLM and Transformers.js loaded as npm packages via Vite.

**Tech Stack:** React 19 + TypeScript, Tailwind v4, `@mlc-ai/web-llm`, `@xenova/transformers`, `idb` (already available via devhub's Dexie dep, but we use idb directly for the vector store), Lucide React icons, devhub CSS variable system (`bg-surface`, `text-on-surface`, `border-border`, `bg-accent`, etc.).

---

## File Map

```
src/features/rag-studio/
├── index.tsx                        # Page root — wires all panels + overlay
├── components/
│   ├── RagToolbar.tsx               # Top bar: title + clear all button
│   ├── DropZone.tsx                 # File drop / browse area
│   ├── DocList.tsx                  # Ingested docs with status badges
│   ├── ChatPanel.tsx                # Message history + input form
│   └── ModelOverlay.tsx             # Full-screen download progress overlay
├── hooks/
│   └── useRagEngine.ts              # All RAG state: docs, messages, loading flags
└── utils/
    ├── vectorDb.ts                  # IndexedDB CRUD for knowledge_nodes (idb)
    ├── embed.ts                     # Transformers.js feature-extraction pipeline
    ├── llm.ts                       # WebLLM engine singleton + streaming
    ├── ingest.ts                    # File → chunk → LLM extract → embed → store
    └── retrieve.ts                  # Query embed → cosine sim scan → top-K

src/App.tsx                          # +1 route: /tools/rag
src/pages/HomePage.tsx               # +1 studio card: RAG Studio
package.json                         # + @mlc-ai/web-llm, @xenova/transformers
```

---

## Task 1: Install Dependencies + Register Route + Add Studio Card

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/pages/HomePage.tsx`

- [ ] **Step 1: Install packages**

```bash
cd /Users/aayushgour/Desktop/projects/devhub
npm install @mlc-ai/web-llm @xenova/transformers
```

Expected: both packages added to `node_modules` and `package.json` dependencies. No errors.

- [ ] **Step 2: Read current `src/App.tsx`**

Read the file to find the exact import list and route structure before editing.

- [ ] **Step 3: Add RAG Studio route to `src/App.tsx`**

Add a lazy import for the new feature page and a route at `/tools/rag`. Follow the exact same pattern as the existing `/tools/markdown` and `/tools/diagram` routes. Example of the change (adapt to actual file content):

```tsx
// Add import (lazy or direct — match existing pattern)
import RagStudioPage from '@/features/rag-studio'

// Inside <Routes> → <Route path="/" element={<AppShell />}> block, add:
<Route path="tools/rag" element={<RagStudioPage />} />
```

- [ ] **Step 4: Read current `src/pages/HomePage.tsx`**

Read the file to find the exact `studios` array and Studio type structure.

- [ ] **Step 5: Add RAG Studio card to `src/pages/HomePage.tsx`**

Add a new entry to the `studios` array. Use `BrainCircuit` from lucide-react as icon. Match the exact object shape of existing entries:

```tsx
{
  id: 'rag',
  title: 'RAG Studio',
  description: 'Chat with your documents. Browser-native vector search and LLM — no server.',
  icon: <BrainCircuit size={20} />,
  status: 'available',
  phase: 'Phase 3',
  href: '/tools/rag',
},
```

Add `BrainCircuit` to the lucide-react import line if not already present.

- [ ] **Step 6: Create a stub `src/features/rag-studio/index.tsx` so the route doesn't 404**

```tsx
export default function RagStudioPage() {
  return (
    <div className="flex items-center justify-center h-full text-on-surface-muted text-sm">
      RAG Studio — coming soon
    </div>
  )
}
```

- [ ] **Step 7: Run dev server and verify**

```bash
npm run dev
```

Open `http://localhost:5173` (or whatever port Vite picks). Verify:
- Home page shows the new RAG Studio card
- Clicking it navigates to `/tools/rag` without a 404
- No TypeScript errors in terminal

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/App.tsx src/pages/HomePage.tsx src/features/rag-studio/index.tsx
git commit -m "feat(rag-studio): register route, add studio card, install deps"
```

---

## Task 2: IndexedDB Vector Store — `utils/vectorDb.ts`

**Files:**
- Create: `src/features/rag-studio/utils/vectorDb.ts`

- [ ] **Step 1: Create `src/features/rag-studio/utils/vectorDb.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'rag-studio-vectors'
const DB_VERSION = 1
const STORE = 'knowledge_nodes'

export interface KnowledgeNode {
  id?: number
  text: string
  rawChunk: string
  sourceFile: string
  vector: number[]
}

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by_source', 'sourceFile', { unique: false })
      }
    },
  })
  return _db
}

export async function putNode(node: Omit<KnowledgeNode, 'id'>): Promise<number> {
  const db = await getDB()
  return db.add(STORE, node) as Promise<number>
}

export async function getAllNodes(): Promise<KnowledgeNode[]> {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function clearAll(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

export async function clearBySource(sourceFile: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const index = tx.store.index('by_source')
  let cursor = await index.openCursor(IDBKeyRange.only(sourceFile))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function getSourceFiles(): Promise<string[]> {
  const nodes = await getAllNodes()
  return [...new Set(nodes.map((n) => n.sourceFile))]
}
```

Note: `idb` is a dependency of `idb` package itself. Check if devhub uses `idb` directly or only via Dexie. If `idb` is not in `node_modules` as a direct dep, run `npm install idb` first.

- [ ] **Step 2: Check if `idb` is available**

```bash
node -e "require('idb'); console.log('ok')" 2>/dev/null || echo "need to install"
```

If output is "need to install", run `npm install idb`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `vectorDb.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/features/rag-studio/utils/vectorDb.ts
git commit -m "feat(rag-studio): IndexedDB vector store — putNode, getAllNodes, clearAll"
```

---

## Task 3: Embedding Utility — `utils/embed.ts`

**Files:**
- Create: `src/features/rag-studio/utils/embed.ts`

- [ ] **Step 1: Create `src/features/rag-studio/utils/embed.ts`**

```ts
import { pipeline, env } from '@xenova/transformers'

env.allowLocalModels = false

const MODEL = 'Xenova/all-MiniLM-L6-v2'

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline>>
let _pipe: FeatureExtractionPipeline | null = null

export type EmbedProgressCallback = (pct: number, file: string) => void

export async function getEmbedder(onProgress?: EmbedProgressCallback): Promise<FeatureExtractionPipeline> {
  if (_pipe) return _pipe

  _pipe = await pipeline('feature-extraction', MODEL, {
    progress_callback: onProgress
      ? (p: { progress?: number; file?: string }) => {
          const pct = p.progress != null ? Math.round(p.progress) : 0
          onProgress(pct, p.file ?? '')
        }
      : undefined,
  })
  return _pipe
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  // output.data is a Float32Array
  return Array.from(output.data as Float32Array)
}

export async function embedBatch(
  texts: string[],
  onProgress?: (i: number, total: number) => void,
): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    results.push(await embed(texts[i]))
    onProgress?.(i + 1, texts.length)
  }
  return results
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `embed.ts`. If `@xenova/transformers` types are missing, add `// @ts-ignore` above the import as a last resort — but try fixing types first.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/embed.ts
git commit -m "feat(rag-studio): Transformers.js embedding utility — MiniLM-L6-v2"
```

---

## Task 4: WebLLM Singleton — `utils/llm.ts`

**Files:**
- Create: `src/features/rag-studio/utils/llm.ts`

- [ ] **Step 1: Create `src/features/rag-studio/utils/llm.ts`**

```ts
import * as webllm from '@mlc-ai/web-llm'

const MODEL_ID = 'Llama-3.2-3B-Instruct-q4f32_1-MLC'

export type LLMProgressCallback = (pct: number, text: string) => void

let _engine: webllm.MLCEngine | null = null
let _loadingPromise: Promise<webllm.MLCEngine> | null = null

export async function getEngine(onProgress?: LLMProgressCallback): Promise<webllm.MLCEngine> {
  if (_engine) return _engine
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (p: webllm.InitProgressReport) => {
      const pct = Math.round((p.progress ?? 0) * 100)
      onProgress?.(pct, p.text ?? '')
    },
  }).then((engine) => {
    _engine = engine
    _loadingPromise = null
    return engine
  })

  return _loadingPromise
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function complete(
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): Promise<string> {
  const engine = await getEngine()
  const reply = await engine.chat.completions.create({
    messages,
    max_tokens: opts.max_tokens ?? 512,
    temperature: 0.1,
  })
  return reply.choices[0].message.content ?? ''
}

export async function* streamComplete(
  messages: ChatMessage[],
  opts: { max_tokens?: number } = {},
): AsyncGenerator<string> {
  const engine = await getEngine()
  const stream = await engine.chat.completions.create({
    messages,
    max_tokens: opts.max_tokens ?? 512,
    temperature: 0.1,
    stream: true,
  })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? ''
    if (delta) yield delta
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

If `@mlc-ai/web-llm` exports differ from expected, check actual types:
```bash
cat node_modules/@mlc-ai/web-llm/lib/index.d.ts | head -60
```

Adjust type references (`MLCEngine`, `InitProgressReport`) to match actual exports.

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/llm.ts
git commit -m "feat(rag-studio): WebLLM singleton — Llama-3.2-3B streaming"
```

---

## Task 5: Ingestion Pipeline — `utils/ingest.ts`

**Files:**
- Create: `src/features/rag-studio/utils/ingest.ts`

- [ ] **Step 1: Create `src/features/rag-studio/utils/ingest.ts`**

```ts
import { getEngine } from './llm'
import { embedBatch } from './embed'
import { putNode } from './vectorDb'

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 100

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

async function extractChunk(chunk: string): Promise<ExtractedChunk> {
  const engine = await getEngine()
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
    } as never, // WebLLM types may not expose json_schema yet
  })

  try {
    return JSON.parse(reply.choices[0].message.content ?? '{}') as ExtractedChunk
  } catch {
    return { entities: [], summary: chunk.slice(0, 200) }
  }
}

export type IngestStatusCallback = (status: string) => void

export async function ingestFile(
  file: File,
  onStatus: IngestStatusCallback,
): Promise<void> {
  onStatus('reading file…')
  const text = await file.text()
  const chunks = chunkText(text)

  type Segment = { text: string; raw: string }
  const segments: Segment[] = []

  for (let i = 0; i < chunks.length; i++) {
    onStatus(`extracting chunk ${i + 1}/${chunks.length}`)
    const extracted = await extractChunk(chunks[i])

    segments.push({
      text: extracted.summary || chunks[i].slice(0, 200),
      raw: chunks[i],
    })

    for (const entity of extracted.entities) {
      segments.push({
        text: `${entity.name} (${entity.type}): ${entity.description}`,
        raw: chunks[i],
      })
    }
  }

  onStatus(`embedding ${segments.length} segments…`)
  const vectors = await embedBatch(
    segments.map((s) => s.text),
    (i, total) => onStatus(`embedding ${i}/${total}`),
  )

  onStatus('storing vectors…')
  for (let i = 0; i < segments.length; i++) {
    await putNode({
      text: segments[i].text,
      rawChunk: segments[i].raw,
      sourceFile: file.name,
      vector: vectors[i],
    })
  }

  onStatus('done')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/ingest.ts
git commit -m "feat(rag-studio): ingestion pipeline — chunk, LLM extract, embed, store"
```

---

## Task 6: Retrieval Utility — `utils/retrieve.ts`

**Files:**
- Create: `src/features/rag-studio/utils/retrieve.ts`

- [ ] **Step 1: Create `src/features/rag-studio/utils/retrieve.ts`**

```ts
import { embed } from './embed'
import { getAllNodes, type KnowledgeNode } from './vectorDb'

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
  const queryVec = await embed(query)
  const nodes = await getAllNodes()
  if (nodes.length === 0) return []

  const scored: ScoredNode[] = nodes.map((node) => ({
    ...node,
    score: cosineSim(queryVec, node.vector),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/utils/retrieve.ts
git commit -m "feat(rag-studio): cosine similarity retrieval — top-K from IndexedDB"
```

---

## Task 7: Core State Hook — `hooks/useRagEngine.ts`

**Files:**
- Create: `src/features/rag-studio/hooks/useRagEngine.ts`

This hook owns all mutable state so the page component stays thin.

- [ ] **Step 1: Create `src/features/rag-studio/hooks/useRagEngine.ts`**

```ts
import { useState, useCallback, useRef } from 'react'
import { getEmbedder } from '../utils/embed'
import { getEngine } from '../utils/llm'
import { ingestFile } from '../utils/ingest'
import { retrieve } from '../utils/retrieve'
import { clearAll, clearBySource, getSourceFiles } from '../utils/vectorDb'
import { streamComplete } from '../utils/llm'

// ── Types ─────────────────────────────────────────────────────────

export interface DocEntry {
  name: string
  status: 'processing' | 'done' | 'error'
  statusText: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
}

export type OverlayState =
  | { open: false }
  | { open: true; label: string; pct: number; detail: string }

// ── Hook ──────────────────────────────────────────────────────────

export function useRagEngine() {
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [overlay, setOverlay] = useState<OverlayState>({ open: false })
  const [chatDisabled, setChatDisabled] = useState(false)
  const embeddingReadyRef = useRef(false)

  // ── Overlay helpers ─────────────────────────────────────────────

  const showOverlay = useCallback((label: string) => {
    setOverlay({ open: true, label, pct: 0, detail: '' })
  }, [])

  const updateOverlay = useCallback((pct: number, detail: string) => {
    setOverlay((prev) =>
      prev.open ? { ...prev, pct, detail } : prev,
    )
  }, [])

  const hideOverlay = useCallback(() => {
    setOverlay({ open: false })
  }, [])

  // ── Boot: preload embedder ──────────────────────────────────────

  const bootEmbedder = useCallback(async () => {
    if (embeddingReadyRef.current) return
    showOverlay('Loading embedding model…')
    try {
      await getEmbedder((pct, file) => updateOverlay(pct, file))
      embeddingReadyRef.current = true
    } catch (err) {
      console.error('Embedder load failed', err)
      setOverlay({ open: true, label: 'Failed to load embedding model. Refresh to retry.', pct: 0, detail: '' })
      return
    }
    hideOverlay()
  }, [showOverlay, updateOverlay, hideOverlay])

  // ── Doc status helpers ──────────────────────────────────────────

  const upsertDoc = useCallback((name: string, status: DocEntry['status'], statusText: string) => {
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.name === name)
      const entry: DocEntry = { name, status, statusText }
      if (idx === -1) return [...prev, entry]
      const next = [...prev]
      next[idx] = entry
      return next
    })
  }, [])

  // ── File ingestion ──────────────────────────────────────────────

  const processFiles = useCallback(
    async (files: File[]) => {
      // Ensure embedder is loaded
      await bootEmbedder()
      if (!embeddingReadyRef.current) return

      // Load LLM
      showOverlay('Loading LLM (first run ~2.2 GB)…')
      try {
        await getEngine((pct, text) => updateOverlay(pct, text))
      } catch (err) {
        console.error('LLM load failed', err)
        setOverlay({ open: true, label: 'Failed to load LLM. Check network & refresh.', pct: 0, detail: '' })
        return
      }
      hideOverlay()

      for (const file of files) {
        upsertDoc(file.name, 'processing', 'starting…')
        try {
          await ingestFile(file, (status) => {
            upsertDoc(file.name, 'processing', status)
          })
          upsertDoc(file.name, 'done', '')
        } catch (err) {
          console.error(`Ingest failed: ${file.name}`, err)
          upsertDoc(file.name, 'error', String(err))
        }
      }
    },
    [bootEmbedder, showOverlay, updateOverlay, hideOverlay, upsertDoc],
  )

  // ── Chat ────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (question: string) => {
      if (chatDisabled) return
      setChatDisabled(true)

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
      }
      setMessages((prev) => [...prev, userMsg])

      const nodes = await retrieve(question, 5)

      let contextBlock = ''
      let charBudget = 8000
      for (const node of nodes) {
        const snippet = `[${node.sourceFile}]\n${node.rawChunk ?? node.text}`
        if (snippet.length > charBudget) break
        contextBlock += snippet + '\n\n'
        charBudget -= snippet.length
      }

      const systemPrompt =
        nodes.length > 0
          ? `You are a helpful assistant. Answer the user's question using ONLY the context below.\nIf the answer is not in the context, say "I couldn't find that in the uploaded documents."\n\n=== CONTEXT ===\n${contextBlock.trim()}\n=== END CONTEXT ===`
          : `You are a helpful assistant. The user has not uploaded any documents yet. Let them know they can drop .txt or .md files on the left panel.`

      const aiMsgId = `ai-${Date.now()}`
      const aiMsg: ChatMessage = { id: aiMsgId, role: 'ai', content: '', streaming: true }
      setMessages((prev) => [...prev, aiMsg])

      try {
        for await (const delta of streamComplete(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
          ],
          { max_tokens: 512 },
        )) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + delta } : m,
            ),
          )
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: 'Error generating response. Check console.', streaming: false }
              : m,
          ),
        )
        console.error('Stream error', err)
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, streaming: false } : m)),
      )
      setChatDisabled(false)
    },
    [chatDisabled],
  )

  // ── Clear ───────────────────────────────────────────────────────

  const clearDocs = useCallback(async () => {
    await clearAll()
    setDocs([])
    setMessages([])
  }, [])

  const removeDoc = useCallback(async (name: string) => {
    await clearBySource(name)
    setDocs((prev) => prev.filter((d) => d.name !== name))
  }, [])

  return {
    docs,
    messages,
    overlay,
    chatDisabled,
    bootEmbedder,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/features/rag-studio/hooks/useRagEngine.ts
git commit -m "feat(rag-studio): core state hook — docs, messages, ingest, chat"
```

---

## Task 8: UI Components

**Files:**
- Create: `src/features/rag-studio/components/ModelOverlay.tsx`
- Create: `src/features/rag-studio/components/RagToolbar.tsx`
- Create: `src/features/rag-studio/components/DropZone.tsx`
- Create: `src/features/rag-studio/components/DocList.tsx`
- Create: `src/features/rag-studio/components/ChatPanel.tsx`

- [ ] **Step 1: Create `src/features/rag-studio/components/ModelOverlay.tsx`**

```tsx
import { type OverlayState } from '../hooks/useRagEngine'

interface Props {
  state: OverlayState
}

export default function ModelOverlay({ state }: Props) {
  if (!state.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface border border-border rounded-xl p-8 w-80 flex flex-col gap-3 text-center">
        <p className="text-sm text-on-surface font-medium">{state.label}</p>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out rounded-full"
            style={{ width: `${state.pct}%` }}
          />
        </div>
        <p className="text-xs text-on-surface-muted">
          {state.pct}%{state.detail ? ` — ${state.detail}` : ''}
        </p>
        <p className="text-xs text-on-surface-muted mt-1">
          Models are cached after first download.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/features/rag-studio/components/RagToolbar.tsx`**

```tsx
import { Trash2 } from 'lucide-react'

interface Props {
  onClearAll: () => void
}

export default function RagToolbar({ onClearAll }: Props) {
  return (
    <div className="h-11 flex items-center px-4 gap-3 shrink-0 border-b border-border bg-surface">
      <span className="text-sm font-semibold text-on-surface tracking-tight">RAG Studio</span>
      <div className="flex-1" />
      <button
        onClick={onClearAll}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border text-xs text-on-surface-muted hover:text-on-surface hover:border-on-surface-muted transition-colors duration-150 cursor-pointer font-[inherit]"
        title="Clear all documents and chat history"
      >
        <Trash2 size={12} />
        Clear all
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/features/rag-studio/components/DropZone.tsx`**

```tsx
import { useRef, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
}

export default function DropZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handle = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const valid = [...files].filter((f) => /\.(txt|md)$/i.test(f.name))
      if (valid.length) onFiles(valid)
    },
    [onFiles],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handle(e.dataTransfer.files)
      }}
      className={cn(
        'rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors duration-150 select-none',
        dragOver
          ? 'border-accent text-accent bg-accent/5'
          : 'border-border text-on-surface-muted hover:border-accent/60 hover:text-on-surface',
      )}
    >
      <Upload size={20} className="mx-auto mb-2 opacity-60" />
      <p className="text-xs leading-5">
        Drop <span className="font-medium">.txt</span> or <span className="font-medium">.md</span> files
        <br />
        or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md"
        multiple
        hidden
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Create `src/features/rag-studio/components/DocList.tsx`**

```tsx
import { CheckCircle, XCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type DocEntry } from '../hooks/useRagEngine'

interface Props {
  docs: DocEntry[]
  onRemove: (name: string) => void
}

export default function DocList({ docs, onRemove }: Props) {
  if (docs.length === 0) {
    return (
      <p className="text-xs text-on-surface-muted text-center py-4 px-2">
        No documents yet. Drop files above.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {docs.map((doc) => (
        <li
          key={doc.name}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-raised text-xs group"
        >
          {doc.status === 'processing' && (
            <Loader2 size={12} className="shrink-0 text-accent animate-spin" />
          )}
          {doc.status === 'done' && (
            <CheckCircle size={12} className="shrink-0 text-green-500" />
          )}
          {doc.status === 'error' && (
            <XCircle size={12} className="shrink-0 text-red-500" />
          )}
          <span
            className={cn(
              'flex-1 truncate',
              doc.status === 'error' ? 'text-red-400' : 'text-on-surface-muted',
            )}
            title={doc.status === 'processing' ? doc.statusText : doc.name}
          >
            {doc.status === 'processing' ? doc.statusText : doc.name}
          </span>
          {doc.status !== 'processing' && (
            <button
              onClick={() => onRemove(doc.name)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-muted hover:text-on-surface cursor-pointer"
              title={`Remove ${doc.name}`}
            >
              <X size={11} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Create `src/features/rag-studio/components/ChatPanel.tsx`**

```tsx
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ChatMessage } from '../hooks/useRagEngine'

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-on-surface-muted text-center mt-16 px-6">
            Upload documents on the left, then ask questions here.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words',
              msg.role === 'user'
                ? 'self-end bg-surface-raised text-on-surface'
                : 'self-start bg-surface border border-border text-on-surface',
              msg.streaming && 'after:content-["▋"] after:animate-pulse',
            )}
          >
            {msg.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input form */}
      <form
        onSubmit={submit}
        className="flex gap-2 p-4 border-t border-border bg-surface shrink-0"
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask something about your documents… (Enter to send)"
          disabled={disabled}
          className="flex-1 resize-none rounded-lg border border-border bg-surface-raised text-sm text-on-surface placeholder:text-on-surface-muted px-3 py-2 focus:outline-none focus:border-accent transition-colors duration-150 disabled:opacity-50 font-[inherit]"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="self-end flex items-center justify-center w-9 h-9 rounded-lg bg-accent text-accent-text border-none cursor-pointer transition-[background-color,opacity] duration-150 hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add src/features/rag-studio/components/
git commit -m "feat(rag-studio): UI components — overlay, toolbar, dropzone, doclist, chat"
```

---

## Task 9: Wire Up Main Page — `index.tsx`

**Files:**
- Modify: `src/features/rag-studio/index.tsx` (replace stub)

- [ ] **Step 1: Replace stub with full implementation**

```tsx
import { useEffect } from 'react'
import { useRagEngine } from './hooks/useRagEngine'
import ModelOverlay from './components/ModelOverlay'
import RagToolbar from './components/RagToolbar'
import DropZone from './components/DropZone'
import DocList from './components/DocList'
import ChatPanel from './components/ChatPanel'

export default function RagStudioPage() {
  const {
    docs,
    messages,
    overlay,
    chatDisabled,
    bootEmbedder,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  } = useRagEngine()

  // Preload embedding model on mount
  useEffect(() => { bootEmbedder() }, [bootEmbedder])

  return (
    <>
      <ModelOverlay state={overlay} />

      <div className="-my-8 -mx-10 flex flex-col h-full">
        <RagToolbar onClearAll={clearDocs} />

        <div className="flex flex-1 min-h-0">
          {/* Left: document panel */}
          <aside className="w-64 shrink-0 flex flex-col gap-4 p-4 border-r border-border bg-surface overflow-y-auto">
            <div>
              <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest mb-3">
                Documents
              </h2>
              <DropZone onFiles={processFiles} />
            </div>
            <DocList docs={docs} onRemove={removeDoc} />
          </aside>

          {/* Right: chat */}
          <div className="flex-1 min-w-0">
            <ChatPanel
              messages={messages}
              disabled={chatDisabled}
              onSend={sendMessage}
            />
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run dev server and do full manual test**

```bash
npm run dev
```

Test the complete flow:
1. Navigate to RAG Studio from home page
2. Embedding model download overlay appears and completes
3. Drop a .txt file → LLM loads → doc appears as "processing" then "done"
4. Ask a question in chat → streaming AI response appears
5. Ask a question not in the doc → model says it can't find the answer
6. Click "Clear all" → docs and messages clear

- [ ] **Step 3: Verify production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript or Vite errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/rag-studio/index.tsx
git commit -m "feat(rag-studio): wire up main page — two-panel layout with overlay"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|---|---|
| Browser-native, no server | All utils run client-side |
| File ingestion (.txt/.md) | Task 5 (ingest.ts) + Task 8 (DropZone) |
| JSON schema extraction via WebLLM | Task 5 ingestFile → extractChunk |
| Transformers.js MiniLM embedding | Task 3 (embed.ts) |
| IndexedDB vector storage | Task 2 (vectorDb.ts) |
| Cosine similarity top-K retrieval | Task 6 (retrieve.ts) |
| Streaming LLM responses | Task 4 (llm.ts streamComplete) |
| Context injection + token budget cap | Task 7 useRagEngine sendMessage (~2000 tok) |
| Download progress overlay | Task 8 ModelOverlay + Task 7 bootEmbedder/processFiles |
| Fits devhub tool pattern | Task 9: `-my-8 -mx-10` two-pane layout |
| Route registered | Task 1 App.tsx |
| Studio card on home page | Task 1 HomePage.tsx |
| Tailwind v4 + CSS variables | All components use `bg-surface`, `text-on-surface`, etc. |
| TypeScript throughout | All files are `.ts` / `.tsx` |

### Placeholder Scan

No TBD or TODO entries found.

### Type Consistency

- `KnowledgeNode` exported from `vectorDb.ts`, imported by `retrieve.ts` — consistent.
- `ChatMessage` in `useRagEngine.ts` uses `role: 'user' | 'ai'` (UI roles). `llm.ts` `ChatMessage` uses `role: 'system' | 'user' | 'assistant'` (LLM roles). These are intentionally separate — the hook converts before calling `streamComplete`.
- `OverlayState` exported from hook, imported by `ModelOverlay` — consistent.
- `DocEntry` exported from hook, imported by `DocList` — consistent.
- `ingestFile(file, onStatus)` signature in `ingest.ts` matches call in `useRagEngine.ts` — consistent.
