# DevHub

A browser-based developer workspace. No backend, no signup, no data leaving your machine.

## Studios

### Available

| Studio | Route | Description |
|--------|-------|-------------|
| **Markdown Studio** | `/tools/markdown` | Live editor with syntax highlighting, Mermaid diagrams, callouts, TOC generation, and PDF export |
| **Diagram Studio** | `/tools/diagram` | Mermaid editor with live preview, templates, and SVG/PNG export |
| **RAG Studio** | `/tools/rag` | Chat with your documents using browser-native vector search and a locally-running LLM |

### Coming Soon

JSON Studio · API Studio · Database Studio · Auth Studio · Dev Utilities · Workspace · AI Studio

---

## RAG Studio

Fully client-side retrieval-augmented generation. All models run in-browser via WebAssembly — no API keys, no server.

**Supported file types:** `.txt` `.md` `.pdf` `.docx`

**Pipeline:**
1. Text is extracted and split into sentence-boundary-aware chunks (1500 chars, 150 char overlap)
2. Each chunk is summarised by the LLM, then both the summary and raw chunk are embedded
3. On query: optional expansion generates sub-questions, `retrieveMulti` embeds all queries and scores chunks by cosine similarity against the IndexedDB vector store
4. Top-k chunks are assembled into a context block and streamed through the LLM

**Models:**
- Embedding: `Xenova/bge-base-en-v1.5` (768-dim, via `@xenova/transformers`)
- LLM: `Llama-3.2-3B-Instruct-q4f32_1-MLC` (via `@mlc-ai/web-llm`)

Both models are downloaded once and cached by the browser. First load for the LLM requires ~2.2 GB of download.

**Settings:**
- **Context-aware query expansion** — retrieves a seed context before generating expansion queries, producing more grounded sub-questions at the cost of a small latency increase

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 |
| State | Zustand v5 |
| Editor | Monaco Editor |
| Markdown | marked v18 + highlight.js |
| Diagrams | Mermaid |
| PDF extraction | pdfjs-dist |
| DOCX extraction | mammoth |
| Embeddings | @xenova/transformers |
| LLM inference | @mlc-ai/web-llm |
| Vector store | IndexedDB via idb |

---

## Getting Started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

```bash
npm run build      # production build
npm run preview    # preview production build locally
npm run lint       # ESLint
```

---

## Theming

Five built-in themes selectable from Settings: **Light**, **Dark**, **GitHub**, **Nord**, **Dracula**.

Theme is persisted to `localStorage` via Zustand's `persist` middleware.
