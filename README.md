# DevHub

A browser-based developer workspace. No backend, no signup, no data leaving your machine.

## Studios

| Studio | Route | Description |
|--------|-------|-------------|
| **Markdown Studio** | `/tools/markdown` | Monaco editor with live preview, scroll sync, style panel, multi-file management, and PDF/HTML/Markdown export |
| **Diagram Studio** | `/tools/diagram` | Mermaid editor with live preview, AI generation from natural language, templates, and SVG/PNG export |
| **RAG Studio** | `/tools/rag` | Chat with your documents using browser-native vector search and a locally-running LLM |
| **JSON Studio** | `/tools/json` | JSON editor with tree, graph, diff, JSONPath, schema inference, and type generation modes |
| **Token Studio** | `/tools/tokens` | Tokenize text with GPT/Llama/Qwen/Phi tokenizers and compare token counts side-by-side |
| **SVG Studio** | `/tools/svg` | Convert raster images to SVG using multiple tracing engines with live refinement controls |
| **Crypto Studio** | `/tools/crypto` | JWT decode/encode, hashing, Base64, AES cipher, HMAC, and secure token generation |
| **Image Studio** | `/tools/image` | Batch image conversion between PNG, JPEG, WebP, AVIF, GIF, BMP, and ICO |
| **Repo Explorer** | `/tools/repo-explorer` | Fetch any public GitHub repo, visualise its dependency graph, chat with the codebase, and auto-generate per-file wiki pages |
| **Agent Workspace** | `/tools/agent-workspace` | Run Claude-compatible agents with built-in tools (fetch, search, JS/Python execution, filesystem, memory) and MCP server support |

---

## Markdown Studio

Monaco-powered editor with a live preview pane.

- Syntax highlighting via `highlight.js`
- Mermaid diagram blocks rendered inline
- **Bidirectional scroll sync** — editor and preview scroll in tandem (percentage-based, driver lock prevents echo)
- **Style panel** — per-element typography rules (font, size, weight, colour, spacing), document-level page size and margins; add/remove/modify individual CSS rules per element
- **Font loading** — Google Fonts + FontShare integration for custom typography
- Built-in preview themes: Classic, GitHub, Minimal, Dark
- **Multi-file management** — create, rename, delete, and switch between files in the Files panel
- Upload existing `.md` files to edit them
- Export to **PDF**, **HTML** (self-contained), or raw **Markdown**

---

## Diagram Studio

Mermaid diagram editor with instant preview.

- Mermaid theme switcher (Default, Dark, Forest, Neutral)
- **AI generation** — describe a diagram in natural language; a thinking→generating pipeline produces the Mermaid code (with thinking budget enforcement and automatic fenced-block extraction)
- Starter templates for common diagram types
- Export as **SVG** or **PNG**

---

## RAG Studio

Fully client-side retrieval-augmented generation. All models run in-browser via WebAssembly — no API keys, no server.

**Supported file types:** `.txt` `.md` `.pdf` `.docx`

**Pipeline:**
1. Text is extracted and split into sentence-boundary-aware chunks (1 500 chars, 150-char overlap)
2. Each chunk is summarised by the LLM, then both the summary and raw chunk are embedded
3. On query: optional expansion generates sub-questions; `retrieveMulti` embeds all queries and scores chunks by cosine similarity against the IndexedDB vector store
4. Top-k chunks are assembled into a context block and streamed through the LLM

**UI:**
- Live token streaming with animated cursor; generation time shown per response
- Labeled retrieval stages: idle → expanding → retrieving → generating
- `<think>` blocks from reasoning models stripped from the displayed answer
- CPU/WASM fallback indicated by an amber banner with a performance note

**Supported LLM models** (downloaded once, cached in browser):

| Family | Models |
|--------|--------|
| Qwen3 | 0.6B · 1.7B · 4B · 8B |
| Qwen3.5 | 0.8B · 2B · 4B · 9B |
| Llama | 3.2 1B · 3.2 3B · 3.1 8B |
| Phi | Phi-4 Mini · Phi-3.5 Mini |
| SmolLM2 | 135M · 360M · 1.7B |
| Gemma | 3 1B · 2 2B · 2 9B |
| DeepSeek R1 | Qwen 7B · Llama 8B |
| Mistral | 7B v0.3 · Ministral 3B |
| OLMo 2 | 1B · 7B |
| Hermes 3 | 3B · 8B |

Default (GPU): **Qwen3 4B** (~3.4 GB VRAM)

**GPU / CPU fallback (automatic):** DevHub probes for a real, hardware-backed WebGPU device (rejecting software/fallback adapters). With a usable GPU it runs the WebLLM models above. Without one it falls back to lighter **CPU/WASM** models (ONNX via `@huggingface/transformers`) — default **Qwen2.5 0.5B Instruct** (`onnx-community`). Inference runs in a dedicated **Web Worker** (`llmCpu.worker` / `llmGpu.worker`) so heavy compute stays off the main thread. Settings shows a **GPU/CPU badge** and only lists models your hardware can run.

**Embedding model:** `Xenova/bge-base-en-v1.5` (768-dim, via `@xenova/transformers`) — downloaded once, ~220 MB

**Settings:**
- **LLM model** — swap model from Settings; triggers a download progress overlay on first use
- **Context-aware query expansion** — retrieves seed context before generating sub-questions; more grounded results at a small latency cost

---

## JSON Studio

Split editor + mode panel layout. Left side is always the Monaco JSON editor; the right panel switches by mode.

| Mode | What it does |
|------|-------------|
| **Tree** | Collapsible node tree, value type badges, tooltips on truncated values |
| **Graph** | Hierarchical layout graph of nested objects; arrows originate from the specific row representing the child; zoom/pan via scroll/drag; export to PNG, PDF, or HTML |
| **Diff** | Side-by-side comparison of two JSON inputs using `@codemirror/merge` |
| **JSONPath** | Query the document with JSONPath expressions; pre-populated example queries; results highlighted |
| **Schema** | Infer a JSON Schema from the input |
| **Types** | Generate TypeScript, Go, Rust, or Python type definitions |

Footer shows: valid/invalid status · line count · byte size · total key count · nesting depth.

Graph mode uses `useDeferredValue` to keep the editor responsive during large file parsing, and direct DOM style mutation for zero-React-render zoom/pan. PNG/PDF exports render directly to a canvas (no DOM serialisation); HTML export measures text with an offscreen canvas, recomputes node heights and Y positions for full-value display, then generates a self-contained HTML file.

Multi-file support: upload one or more `.json` files; switch between them in the Files panel without leaving the studio.

---

## Token Studio

**Supported tokenizers:**

| Tokenizer | Models |
|-----------|--------|
| `cl100k_base` | GPT-3.5, GPT-4 |
| `o200k_base` | GPT-4o |
| `p50k_base` | Codex |
| `Qwen2.5` | Qwen 2.5 family (downloaded on first use) |
| `Phi-3.5` | Phi-3.5 Mini (downloaded on first use) |
| `Llama 3` | Llama 3 family (downloaded on first use) |

GPT tokenizers run via `tiktoken` (WASM). Local tokenizers use `@xenova/transformers` and are downloaded on first use, then cached.

**Compare mode** — run two tokenizers on the same text side-by-side to compare token counts and splits; token boundaries are colour-highlighted per tokenizer.

---

## SVG Studio

Upload a raster image (PNG, JPEG, WebP, GIF, BMP, AVIF, TIFF) and trace it to SVG. All four tracing presets run in parallel in the background; results appear in a gallery — pick the best one.

| Preset | Engine | Best for |
|--------|--------|----------|
| **Mono** | Potrace | Single-colour outlines, logos, icons |
| **Color** | Potrace (posterised) | Flat multi-colour logos |
| **Detailed** | ImageTracer.js | Complex or gradient images |
| **Embed** | Base64 embed | Raster fallback inside an SVG wrapper |

After selecting a preset: live code editor + preview pane + refinement knobs (threshold, despeckle, smoothing, colour count, etc.) with context tooltips per knob. SVGO optimisation applied automatically on Mono/Color/Detailed outputs. Copy SVG to clipboard or download.

---

## Crypto Studio

All operations run in-browser using the Web Crypto API.

| Tool | Details |
|------|---------|
| **JWT** | Decode any JWT (header + payload + signature status shown with shield icon) or encode a new one with HS256/HS384/HS512; output in Hex or Base64 |
| **Hash** | MD5 · SHA-1 · SHA-256 · SHA-384 · SHA-512; output in Hex or Base64 |
| **Base64** | Encode/decode text and binary data; URL-safe variant; drag-and-drop file-to-Base64 |
| **Cipher** | AES-128-GCM · AES-256-GCM · AES-256-CBC encrypt/decrypt; random password generation |
| **HMAC** | HMAC-SHA-256/384/512; output in Hex or Base64 |
| **Token** | Cryptographically secure random tokens — Hex · Base64 · Alphanumeric · UUID v4 — at 128/256/512 bits |

---

## Image Studio

Batch image converter running entirely in the browser via the Canvas API.

**Input formats:** PNG · JPEG · WebP · GIF · BMP · SVG · ICO · AVIF · TIFF

**Output formats:** PNG · JPEG · WebP · AVIF · GIF · BMP · ICO

- Drag-and-drop or file picker; add more files to an existing queue
- Per-item format and quality override; global controls applied to all items at once ("Apply to all")
- Side-by-side before/after preview with toggle
- Compression savings shown as a percentage (−X%) when output is smaller than input
- Aspect ratio lock when resizing
- Download individual files or the entire queue as a ZIP

---

## Repo Explorer

Fetch any public GitHub repo and explore it without cloning.

**Features:**

- **Dependency graph** — hierarchical tree layout (longest-path assignment + barycenter ordering) of all internal imports and external packages; colour-coded by language; toggle external packages on/off
- **Wiki generation** — per-file AI wiki pages (Summary · Key Exports · Dependencies · Usage Notes) generated by the selected LLM and streamed live; auto-triggered when a file is selected (debounced); cancellable mid-generation; cached in IndexedDB so re-opening a file is instant
- **Codebase chat** — ask questions about the repo; answers grounded in indexed embeddings via vector search; resizable side panel (drag handle, 180–600 px range)
- **File detail panel** — Monaco code view + wiki tab for any file; triggered by clicking a graph node or selecting from the file tree
- **IndexedDB caching** — fetched files, dependency graph, embeddings, and wiki pages all persist across sessions; header shows indexed branch and time since last index
- **Refetch & reindex** — header button re-downloads the repo from GitHub and re-runs the embedding pipeline

**GitHub access:** Works without a token for public repos. Paste a personal access token in the input for private repos or to raise rate limits.

**File limits:** Files over 100 KB are skipped. Standard generated/cache directories (`node_modules`, `dist`, `.git`, etc.) are excluded automatically.

**LLM:** Uses the same model selected in Settings (shared with RAG Studio). First use after a model change shows a download progress overlay.

**Embedding:** `Xenova/bge-base-en-v1.5` (same as RAG Studio) — WASM inference yields to the main thread every 5 files to keep the UI responsive during large repos.

---

## Agent Workspace

A tool-capable AI agent environment that runs entirely in the browser.

**Built-in tools:**

| Tool | What it does |
|------|-------------|
| `fetch_url` | Fetch any URL via Jina Reader (returns clean Markdown) |
| `web_search` | Search the web and return structured results |
| `run_javascript` | Execute arbitrary JavaScript in a sandboxed context |
| `run_python` | Execute Python via Pyodide (WASM); full standard library |
| `file_system` | Read/write local files via the File System Access API |
| `memory` | Store and retrieve key-value pairs in IndexedDB across sessions |

**MCP support:** Connect to any MCP server (HTTP/SSE); status indicator shows connection health; tools from the MCP server are enumerated and available to the agent alongside built-in tools.

**Run inspector:** Expandable view of each run showing thinking blocks, tool calls with inputs/outputs, and errors highlighted inline. Reasoning (`<think>`) blocks are stripped from the final response.

**Model filtering:** Only models that support tool use are listed.

**Run history:** Previous runs are persisted and can be re-opened from the session list.

---

## VS Code Extension

DevHub also ships as a VS Code extension (in [`extension/`](extension/), published as **DevHub** on Open VSX). It reuses these studios' preview components to render live side-previews from the native editor — Markdown (`.md`/`.mdc`), Mermaid, JSON/JSONL/JSONC, YAML (`.yaml`/`.yml`), TOML, XML, SVG and HTML — plus standalone Token, Crypto and Image tools. RAG and Repo Explorer are web-only.
See [extension/README.md](extension/README.md).

---

## Tech Stack

| Layer | Library | Version |
|-------|---------|---------|
| Framework | React | 19 |
| Language | TypeScript | — |
| Build | Vite | 7 |
| Styling | Tailwind CSS | v4 |
| Routing | React Router | v7 |
| State | Zustand | v5 |
| Editor | Monaco Editor | 4.7 |
| Graph | @xyflow/react (React Flow) | 12 |
| Markdown | marked + highlight.js | 18 / 11 |
| Diagrams | Mermaid | 11 |
| PDF extraction | pdfjs-dist | 4 |
| DOCX extraction | mammoth | 1.12 |
| Embeddings | @xenova/transformers | 2.17 |
| GPU LLM inference | @mlc-ai/web-llm (WebGPU) | 0.2 |
| CPU LLM inference | @huggingface/transformers (ONNX/WASM) | 4 |
| Vector store | IndexedDB via idb | 8 |
| Tokenization | tiktoken (WASM) | 1.0 |
| SVG tracing | potrace-js + imagetracerjs | — |
| SVG optimisation | svgo | 4 |
| JWT | jose | 6 |
| ZIP | fflate | 0.8 |
| Python runtime | Pyodide (WASM) | — |

---

## Getting Started

This is an npm-workspaces monorepo: **`web/`** (this app) and **`extension/`** (the VS Code extension). Run commands from the repo root:

```bash
npm install            # installs both workspaces
npm run dev:web        # dev server at http://localhost:5173
```

```bash
npm run build:web      # production build (web/dist)
npm run lint:web       # ESLint
npm run test           # unit tests (vitest)
```

---

## Theming

Five built-in themes selectable from Settings: **Light**, **Dark**, **GitHub**, **Nord**, **Dracula**.

Theme is persisted to `localStorage` via Zustand's `persist` middleware.

---

## Architecture Notes

- **No backend** — everything runs in the browser; zero server calls except GitHub API and model CDN downloads
- **IndexedDB** (`idb`) is the persistence layer for RAG vector store, repo cache, embeddings, wiki pages, and agent memory
- **GPU/CPU LLM** — WebGPU is probed at runtime (`utils/webgpu.ts`); GPU machines use WebLLM, others fall back to ONNX/WASM models. LLM inference runs in dedicated Web Workers (`llmGpu.worker`, `llmCpu.worker`) to keep compute off the main thread
- **WASM** workloads (tiktoken, transformers.js, Pyodide) yield via `setTimeout(0)` in tight loops to keep the UI responsive
- **Settings** persist to `localStorage` via Zustand; the `ragLlmModel` setting is shared between RAG Studio, Repo Explorer, Diagram Studio AI, and Agent Workspace
- Each studio follows the `studio-root` layout convention — `display: flex; flex-direction: column; height: 100%` — so it fills the full viewport without scroll
