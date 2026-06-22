# Repo Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `repo-explorer` studio that fetches any public GitHub repo, parses multi-language dependencies, indexes files with local embeddings, and shows an interactive React Flow graph + wiki view with AI-powered code explanations.

**Architecture:** Approach A — new `src/features/repo-explorer/` feature following the RAG Studio pattern. Reuses `@xenova/transformers` for embeddings, `@mlc-ai/web-llm` for LLM, `idb` for IndexedDB. Adds a global Zustand `indexingStore` so progress is shown in a non-blocking AppShell footer (also migrates RAG Studio to use it). React Flow (`@xyflow/react`) renders the dependency graph. Two views: Graph (default) and Wiki.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Zustand, `@xyflow/react`, `@xenova/transformers`, `@mlc-ai/web-llm`, `idb`, GitHub REST API, Monaco editor (already installed)

## Global Constraints

- All styling via Tailwind utility classes — no `style={{}}` except runtime-dynamic data-driven values
- No `onMouseEnter/Leave` style mutations — use Tailwind hover variants
- All conditional classNames via `cn()` from `@/lib/utils`
- Root page element must use `studio-root` CSS class
- Use CSS custom property Tailwind mappings: `bg-surface`, `text-on-surface`, `border-border`, `bg-accent`, etc.
- `npx tsc --noEmit` must pass after every task — no `@ts-ignore` or `as any` without comment
- Non-standard sizes as Tailwind arbitrary values, e.g. `w-[220px]`
- Use `rem` everywhere, never `px` unless Tailwind arbitrary value is unavoidable

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `src/store/indexingStore.ts` | Global Zustand store: indexing phase, progress, cancel |
| `src/components/layout/IndexingFooter.tsx` | Thin footer bar reading indexingStore |
| `src/features/repo-explorer/types.ts` | Shared types: RepoFile, DepNode, DepEdge, WikiPage, RepoMeta |
| `src/features/repo-explorer/utils/languageDetect.ts` | ext → language name + color |
| `src/features/repo-explorer/utils/githubApi.ts` | GitHub REST API: fetch tree, fetch file content |
| `src/features/repo-explorer/utils/depParsers.ts` | Regex import extractors per language → internal edges |
| `src/features/repo-explorer/utils/packageParsers.ts` | Manifest parsers (package.json, requirements.txt, etc.) → external nodes |
| `src/features/repo-explorer/utils/repoDb.ts` | IndexedDB namespace per repo: meta, files, graph, embeddings, wiki |
| `src/features/repo-explorer/hooks/useGitHubFetcher.ts` | Fetch + filter repo files, update global indexing store |
| `src/features/repo-explorer/hooks/useIndexer.ts` | Embed files, store vectors in repoDb |
| `src/features/repo-explorer/hooks/useWikiGen.ts` | On-demand wiki page generation + cache |
| `src/features/repo-explorer/hooks/useRepoChat.ts` | Semantic search + WebLLM chat over indexed repo |
| `src/features/repo-explorer/hooks/useRepoExplorer.ts` | Main orchestration hook |
| `src/features/repo-explorer/components/GraphView.tsx` | React Flow canvas: file nodes + dep edges |
| `src/features/repo-explorer/components/NodeDetailPanel.tsx` | Right drawer: Wiki tab + Code tab |
| `src/features/repo-explorer/components/WikiView.tsx` | Wiki mode: file tree sidebar + wiki page |
| `src/features/repo-explorer/components/RepoSidebar.tsx` | File tree with language icons |
| `src/features/repo-explorer/components/ChatPanel.tsx` | Collapsible bottom chat panel |
| `src/features/repo-explorer/components/RepoInput.tsx` | GitHub URL input form |
| `src/features/repo-explorer/components/ViewToggle.tsx` | Graph / Wiki toggle button group |
| `src/features/repo-explorer/index.tsx` | Page root |

### Modified files
| Path | Change |
|---|---|
| `src/components/layout/AppShell.tsx` | Add `<IndexingFooter />` before closing div |
| `src/features/rag-studio/hooks/useRagEngine.ts` | Replace local overlay state with `useIndexingStore` |
| `src/features/rag-studio/index.tsx` | Remove `<ModelOverlay>` |
| `src/App.tsx` | Add repo-explorer route |
| `src/pages/HomePage.tsx` | Add repo-explorer card |

---

## Task 1: Install @xyflow/react + global indexing store + AppShell footer

**Files:**
- Create: `src/store/indexingStore.ts`
- Create: `src/components/layout/IndexingFooter.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Produces: `useIndexingStore` hook, `IndexingState` type

- [ ] **Step 1: Install @xyflow/react**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npm install @xyflow/react
```

Expected: package added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create global indexing store**

Create `src/store/indexingStore.ts`:

```typescript
import { create } from 'zustand'

export type IndexingPhase =
  | 'idle'
  | 'fetching'
  | 'parsing'
  | 'embedding'
  | 'done'
  | 'error'

export interface IndexingState {
  phase: IndexingPhase
  label: string
  filesTotal: number
  filesDone: number
  pct: number
  cancelFn: (() => void) | null
  error: string | null
  // actions
  start: (label: string, cancelFn: () => void) => void
  setPhase: (phase: IndexingPhase, label: string) => void
  setProgress: (done: number, total: number) => void
  finish: () => void
  setError: (msg: string) => void
  cancel: () => void
  dismiss: () => void
}

export const useIndexingStore = create<IndexingState>()((set, get) => ({
  phase: 'idle',
  label: '',
  filesTotal: 0,
  filesDone: 0,
  pct: 0,
  cancelFn: null,
  error: null,

  start: (label, cancelFn) =>
    set({ phase: 'fetching', label, filesTotal: 0, filesDone: 0, pct: 0, cancelFn, error: null }),

  setPhase: (phase, label) => set({ phase, label }),

  setProgress: (done, total) =>
    set({ filesDone: done, filesTotal: total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }),

  finish: () => set({ phase: 'done', pct: 100, cancelFn: null }),

  setError: (msg) => set({ phase: 'error', error: msg, cancelFn: null }),

  cancel: () => {
    get().cancelFn?.()
    set({ phase: 'idle', label: '', pct: 0, cancelFn: null, error: null })
  },

  dismiss: () => set({ phase: 'idle', label: '', pct: 0, error: null }),
}))
```

- [ ] **Step 3: Create IndexingFooter component**

Create `src/components/layout/IndexingFooter.tsx`:

```typescript
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIndexingStore } from '@/store/indexingStore'

export default function IndexingFooter() {
  const { phase, label, pct, filesDone, filesTotal, error, cancel, dismiss } = useIndexingStore()

  if (phase === 'idle') return null

  const isDone = phase === 'done'
  const isError = phase === 'error'

  return (
    <div className={cn(
      'h-8 shrink-0 flex items-center gap-3 px-4 border-t border-border text-xs',
      isDone ? 'bg-surface text-on-surface-muted' : 'bg-surface text-on-surface',
    )}>
      {isError ? (
        <AlertCircle size={12} className="text-red-400 shrink-0" />
      ) : isDone ? (
        <CheckCircle size={12} className="text-accent shrink-0" />
      ) : (
        <div className="w-24 h-1.5 bg-surface-raised rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <span className="flex-1 truncate">
        {isError
          ? error ?? 'Indexing failed'
          : isDone
            ? `${label} — complete`
            : filesTotal > 0
              ? `${label} · ${filesDone}/${filesTotal} files — ${pct}%`
              : label}
      </span>

      <button
        onClick={isDone || isError ? dismiss : cancel}
        className="text-on-surface-muted hover:text-on-surface transition-colors duration-150 shrink-0"
        aria-label={isDone || isError ? 'Dismiss' : 'Cancel indexing'}
      >
        <X size={12} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add IndexingFooter to AppShell**

Modify `src/components/layout/AppShell.tsx`:

```typescript
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandPalette from './CommandPalette'
import IndexingFooter from './IndexingFooter'

export default function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="devhub-main">
          <Outlet />
        </main>
        <IndexingFooter />
      </div>
      <CommandPalette />
    </div>
  )
}
```

- [ ] **Step 5: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/store/indexingStore.ts src/components/layout/IndexingFooter.tsx src/components/layout/AppShell.tsx package.json package-lock.json
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat: global indexing store + non-blocking footer progress bar"
```

---

## Task 2: Migrate RAG Studio to global indexing store

**Files:**
- Modify: `src/features/rag-studio/hooks/useRagEngine.ts`
- Modify: `src/features/rag-studio/index.tsx`

**Interfaces:**
- Consumes: `useIndexingStore` from `@/store/indexingStore`

- [ ] **Step 1: Update useRagEngine to use global store**

In `src/features/rag-studio/hooks/useRagEngine.ts`, remove `overlay`, `showOverlay`, `updateOverlay`, `hideOverlay` local state. Replace with `useIndexingStore`.

Replace the import block top — add:
```typescript
import { useIndexingStore } from '@/store/indexingStore'
```

Remove these from the hook body:
```typescript
// DELETE these lines:
const [overlay, setOverlay] = useState<OverlayState>({ open: false })

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
```

Add inside the hook body (after existing useState calls):
```typescript
const indexing = useIndexingStore()
```

Replace `showOverlay('Loading embedding model…')` with:
```typescript
indexing.start('Loading embedding model', () => {})
```

Replace `updateOverlay(pct, file)` calls in `bootEmbedder` with:
```typescript
(pct, file) => indexing.setProgress(pct, 100)
```

Replace the `hideOverlay()` after embedder loads with:
```typescript
indexing.finish()
```

Replace the failed overlay set with:
```typescript
indexing.setError('Failed to load embedding model. Refresh to retry.')
```

Replace `showOverlay('Loading LLM…')` (if present) similarly. Replace `hideOverlay()` after LLM loads.

In `processFiles`, add before embedding loop:
```typescript
indexing.start('Indexing documents', () => {})
```

After embedding loop:
```typescript
indexing.finish()
```

Remove `overlay` from the returned object.

- [ ] **Step 2: Remove ModelOverlay from RAG Studio page**

In `src/features/rag-studio/index.tsx`, remove the `<ModelOverlay state={overlay} />` line and the `overlay` destructure from `useRagEngine()`.

The file becomes:
```typescript
import { useEffect } from 'react'
import { useRagEngine } from './hooks/useRagEngine'
import RagToolbar from './components/RagToolbar'
import DropZone from './components/DropZone'
import DocList from './components/DocList'
import ChatPanel from './components/ChatPanel'

export default function RagStudioPage() {
  const {
    docs,
    messages,
    chatDisabled,
    retrievalStage,
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  } = useRagEngine()

  useEffect(() => {
    bootEmbedder()
    loadPersistedDocs()
  }, [bootEmbedder, loadPersistedDocs])

  return (
    <div className="studio-root">
      <RagToolbar onClearAll={clearDocs} />

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 flex flex-col gap-4 p-4 border-r border-border bg-surface overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest mb-3">
              Documents
            </h2>
            <DropZone onFiles={processFiles} />
          </div>
          <DocList docs={docs} onRemove={removeDoc} />
        </aside>

        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            disabled={chatDisabled}
            stage={retrievalStage}
            onSend={sendMessage}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Remove OverlayState export from useRagEngine (if unused)**

In `useRagEngine.ts`, remove the `OverlayState` type definition and its export if nothing else imports it. Check with:

```bash
grep -r "OverlayState" /Users/aayushgour/Desktop/projects/devtools/devhub/src
```

If only in `useRagEngine.ts` and `ModelOverlay.tsx`, you can leave `ModelOverlay.tsx` in place (unused) or delete it.

- [ ] **Step 4: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/rag-studio/hooks/useRagEngine.ts src/features/rag-studio/index.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "refactor: migrate RAG Studio to global indexing footer"
```

---

## Task 3: Core types + language detection + GitHub API utility

**Files:**
- Create: `src/features/repo-explorer/types.ts`
- Create: `src/features/repo-explorer/utils/languageDetect.ts`
- Create: `src/features/repo-explorer/utils/githubApi.ts`

**Interfaces:**
- Produces: `RepoFile`, `DepNode`, `DepEdge`, `RepoGraph`, `RepoMeta`, `WikiPage`, `detectLanguage()`, `fetchRepoTree()`, `fetchFileContent()`

- [ ] **Step 1: Create types**

Create `src/features/repo-explorer/types.ts`:

```typescript
export interface RepoMeta {
  owner: string
  repo: string
  url: string
  defaultBranch: string
  fetchedAt: number
  fileCount: number
  languages: string[]
  githubToken?: string
}

export interface RepoFile {
  path: string
  content: string
  language: string
  sizeBytes: number
  skipped?: 'too-large' | 'binary'
}

export interface DepNode {
  id: string          // file path or package name
  label: string       // short display name
  type: 'internal' | 'external'
  language: string
  color: string       // language color
  path?: string       // only for internal nodes
  packageName?: string // only for external nodes
}

export interface DepEdge {
  id: string
  source: string      // node id
  target: string      // node id
}

export interface RepoGraph {
  nodes: DepNode[]
  edges: DepEdge[]
}

export interface WikiPage {
  path: string
  content: string     // markdown
  generatedAt: number
}

export interface RepoIndexedData {
  meta: RepoMeta
  files: RepoFile[]
  graph: RepoGraph
  // embeddings stored separately in repoDb
}

export type ExplorerView = 'graph' | 'wiki'

export interface GithubTreeItem {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
  url: string
}
```

- [ ] **Step 2: Create language detection utility**

Create `src/features/repo-explorer/utils/languageDetect.ts`:

```typescript
interface LangInfo {
  name: string
  color: string
}

const EXT_MAP: Record<string, LangInfo> = {
  ts: { name: 'TypeScript', color: '#3178c6' },
  tsx: { name: 'TypeScript', color: '#3178c6' },
  js: { name: 'JavaScript', color: '#f7df1e' },
  jsx: { name: 'JavaScript', color: '#f7df1e' },
  mjs: { name: 'JavaScript', color: '#f7df1e' },
  cjs: { name: 'JavaScript', color: '#f7df1e' },
  py: { name: 'Python', color: '#3572A5' },
  rs: { name: 'Rust', color: '#dea584' },
  go: { name: 'Go', color: '#00ADD8' },
  java: { name: 'Java', color: '#b07219' },
  kt: { name: 'Kotlin', color: '#A97BFF' },
  kts: { name: 'Kotlin', color: '#A97BFF' },
  rb: { name: 'Ruby', color: '#701516' },
  php: { name: 'PHP', color: '#4F5D95' },
  cs: { name: 'C#', color: '#178600' },
  cpp: { name: 'C++', color: '#f34b7d' },
  cc: { name: 'C++', color: '#f34b7d' },
  cxx: { name: 'C++', color: '#f34b7d' },
  c: { name: 'C', color: '#555555' },
  h: { name: 'C', color: '#555555' },
  hpp: { name: 'C++', color: '#f34b7d' },
  swift: { name: 'Swift', color: '#F05138' },
  dart: { name: 'Dart', color: '#00B4AB' },
  scala: { name: 'Scala', color: '#c22d40' },
  lua: { name: 'Lua', color: '#000080' },
  r: { name: 'R', color: '#198CE7' },
  vue: { name: 'Vue', color: '#41b883' },
  svelte: { name: 'Svelte', color: '#ff3e00' },
  json: { name: 'JSON', color: '#292929' },
  yaml: { name: 'YAML', color: '#cb171e' },
  yml: { name: 'YAML', color: '#cb171e' },
  toml: { name: 'TOML', color: '#9c4221' },
  md: { name: 'Markdown', color: '#083fa1' },
  sh: { name: 'Shell', color: '#89e051' },
  bash: { name: 'Shell', color: '#89e051' },
  zsh: { name: 'Shell', color: '#89e051' },
  css: { name: 'CSS', color: '#563d7c' },
  scss: { name: 'SCSS', color: '#c6538c' },
  html: { name: 'HTML', color: '#e34c26' },
}

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','svg','ico','webp','bmp','tiff',
  'woff','woff2','ttf','eot','otf',
  'zip','tar','gz','bz2','7z','rar',
  'exe','dll','so','dylib','a','lib',
  'pdf','docx','xlsx','pptx',
  'mp3','mp4','wav','avi','mov',
  'db','sqlite','sqlite3',
  'lock', // lockfiles are text but huge and not useful for analysis
])

export function isBinary(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTS.has(ext)
}

export function detectLanguage(path: string): LangInfo {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP[ext] ?? { name: 'Unknown', color: '#888888' }
}

export function languageColor(language: string): string {
  const entry = Object.values(EXT_MAP).find((l) => l.name === language)
  return entry?.color ?? '#888888'
}
```

- [ ] **Step 3: Create GitHub API utility**

Create `src/features/repo-explorer/utils/githubApi.ts`:

```typescript
import type { GithubTreeItem, RepoMeta } from '../types'

const BASE = 'https://api.github.com'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'vendor', 'venv', '.venv', '__pycache__', '.mypy_cache',
  'target', 'bin', 'obj', '.gradle', '.idea', '.vscode',
  'coverage', '.nyc_output', 'storybook-static',
])

const MAX_FILE_BYTES = 100_000

function makeHeaders(token?: string): HeadersInit {
  const h: HeadersInit = { Accept: 'application/vnd.github.v3+json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?\s#]+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ defaultBranch: string; description: string }> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}`, { headers: makeHeaders(token) })
  if (res.status === 401 || res.status === 403) throw new Error('AUTH_REQUIRED')
  if (res.status === 404) throw new Error('REPO_NOT_FOUND')
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  const data = await res.json()
  return { defaultBranch: data.default_branch ?? 'main', description: data.description ?? '' }
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<GithubTreeItem[]> {
  const res = await fetch(
    `${BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: makeHeaders(token) },
  )
  if (!res.ok) throw new Error(`Tree fetch failed: ${res.status}`)
  const data = await res.json()
  if (data.truncated) {
    console.warn('[repo-explorer] Tree truncated — repo has >100k files, results partial')
  }
  const items: GithubTreeItem[] = data.tree ?? []
  return items.filter((item) => {
    if (item.type !== 'blob') return false
    const parts = item.path.split('/')
    if (parts.some((p) => SKIP_DIRS.has(p))) return false
    if ((item.size ?? 0) > MAX_FILE_BYTES) return false
    return true
  })
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string,
): Promise<string> {
  const res = await fetch(
    `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    { headers: makeHeaders(token) },
  )
  if (!res.ok) throw new Error(`File fetch failed: ${path} — ${res.status}`)
  const data = await res.json()
  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''))
  }
  return data.content ?? ''
}

export async function fetchFilesBatched(
  owner: string,
  repo: string,
  paths: string[],
  token?: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const BATCH = 5
  const results = new Map<string, string>()
  for (let i = 0; i < paths.length; i += BATCH) {
    if (signal?.aborted) break
    const batch = paths.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await fetchFileContent(owner, repo, path, token)
          results.set(path, content)
        } catch {
          results.set(path, '')
        }
      }),
    )
    onProgress?.(Math.min(i + BATCH, paths.length), paths.length)
  }
  return results
}

export function buildRepoMeta(
  owner: string,
  repo: string,
  defaultBranch: string,
  languages: string[],
  fileCount: number,
  token?: string,
): RepoMeta {
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    defaultBranch,
    fetchedAt: Date.now(),
    fileCount,
    languages,
    githubToken: token,
  }
}
```

- [ ] **Step 4: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): types, language detection, GitHub API utility"
```

---

## Task 4: Multi-language dependency parsers

**Files:**
- Create: `src/features/repo-explorer/utils/depParsers.ts`
- Create: `src/features/repo-explorer/utils/packageParsers.ts`

**Interfaces:**
- Consumes: `RepoFile`, `DepNode`, `DepEdge` from `../types`
- Produces: `parseImports()`, `resolveEdges()`, `parsePackageManifests()`

- [ ] **Step 1: Create import parsers**

Create `src/features/repo-explorer/utils/depParsers.ts`:

```typescript
// Returns raw import specifiers (not resolved paths) from file content
export function extractImports(content: string, language: string): string[] {
  const imports: string[] = []

  switch (language) {
    case 'TypeScript':
    case 'JavaScript': {
      // static imports: import x from '...' / import '...'
      const staticRe = /(?:^|\n)\s*import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = staticRe.exec(content)) !== null) imports.push(m[1])
      // require('...')
      const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      while ((m = requireRe.exec(content)) !== null) imports.push(m[1])
      // dynamic import('...')
      const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      while ((m = dynRe.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'Python': {
      const re = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1] ?? m[2])
      break
    }
    case 'Go': {
      // single: import "pkg"
      const singleRe = /import\s+"([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = singleRe.exec(content)) !== null) imports.push(m[1])
      // block: import ( "pkg1" \n "pkg2" )
      const blockRe = /import\s*\(([\s\S]*?)\)/g
      while ((m = blockRe.exec(content)) !== null) {
        const block = m[1]
        const pkgRe = /"([^"]+)"/g
        let pm: RegExpExecArray | null
        while ((pm = pkgRe.exec(block)) !== null) imports.push(pm[1])
      }
      break
    }
    case 'Rust': {
      // use crate::foo or use ::foo or use foo::bar
      const re = /^\s*use\s+([\w:]+)/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'Java':
    case 'Kotlin': {
      const re = /^\s*import\s+([\w.]+)/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'Ruby': {
      const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'PHP': {
      const re = /^\s*(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/gm
      const useRe = /^\s*use\s+([\w\\]+)/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      while ((m = useRe.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'C':
    case 'C++': {
      // only local includes (quoted, not angle bracket) for internal edges
      const re = /^\s*#include\s+"([^"]+)"/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'Swift': {
      const re = /^\s*import\s+(\w+)/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    case 'Dart': {
      const re = /^\s*import\s+['"]([^'"]+)['"]/gm
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) imports.push(m[1])
      break
    }
    default:
      break
  }

  return [...new Set(imports)]
}

// Given a file path + import specifier, try to resolve to another file path in the repo
function resolveRelative(fromPath: string, specifier: string, allPaths: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null

  const dir = fromPath.split('/').slice(0, -1).join('/')
  const candidates = [
    `${dir}/${specifier}`,
    `${dir}/${specifier}.ts`,
    `${dir}/${specifier}.tsx`,
    `${dir}/${specifier}.js`,
    `${dir}/${specifier}.jsx`,
    `${dir}/${specifier}/index.ts`,
    `${dir}/${specifier}/index.tsx`,
    `${dir}/${specifier}/index.js`,
  ]

  for (const c of candidates) {
    // Normalize path (remove ./ and ../)
    const normalized = normalizePath(c)
    if (allPaths.has(normalized)) return normalized
  }
  return null
}

function normalizePath(path: string): string {
  const parts = path.split('/')
  const result: string[] = []
  for (const p of parts) {
    if (p === '..') result.pop()
    else if (p !== '.') result.push(p)
  }
  return result.join('/')
}

export interface ParsedEdge {
  source: string   // file path
  target: string   // file path (internal) or package name (external)
  external: boolean
}

export function buildEdges(
  files: Array<{ path: string; content: string; language: string }>,
): ParsedEdge[] {
  const allPaths = new Set(files.map((f) => f.path))
  const edges: ParsedEdge[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const specifiers = extractImports(file.content, file.language)
    for (const spec of specifiers) {
      const resolved = resolveRelative(file.path, spec, allPaths)
      if (resolved) {
        const key = `${file.path}→${resolved}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({ source: file.path, target: resolved, external: false })
        }
      } else if (!spec.startsWith('.')) {
        // External package — use root package name only
        const pkgName = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : spec.split('/')[0]
        const key = `${file.path}→pkg:${pkgName}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({ source: file.path, target: `pkg:${pkgName}`, external: true })
        }
      }
    }
  }

  return edges
}
```

- [ ] **Step 2: Create package manifest parsers**

Create `src/features/repo-explorer/utils/packageParsers.ts`:

```typescript
export interface ExternalPackage {
  name: string
  version?: string
  ecosystem: string
}

function parseJsonSafe(content: string): Record<string, unknown> | null {
  try { return JSON.parse(content) } catch { return null }
}

// package.json → npm deps
function parsePackageJson(content: string): ExternalPackage[] {
  const json = parseJsonSafe(content) as Record<string, Record<string, string>> | null
  if (!json) return []
  const deps: ExternalPackage[] = []
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const block = json[section] ?? {}
    for (const [name, version] of Object.entries(block)) {
      deps.push({ name, version: String(version), ecosystem: 'npm' })
    }
  }
  return deps
}

// requirements.txt → Python deps
function parseRequirementsTxt(content: string): ExternalPackage[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
    .map((l) => {
      const [name, version] = l.split(/[=><~!]+/)
      return { name: name.trim(), version: version?.trim(), ecosystem: 'pip' }
    })
}

// Cargo.toml → Rust crates
function parseCargotoml(content: string): ExternalPackage[] {
  const deps: ExternalPackage[] = []
  const section = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/)?.[1] ?? ''
  const re = /^(\w[\w-]*)\s*=\s*["']?([^"'\n]+)["']?/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    deps.push({ name: m[1], version: m[2].trim(), ecosystem: 'cargo' })
  }
  return deps
}

// go.mod → Go modules
function parseGoMod(content: string): ExternalPackage[] {
  const deps: ExternalPackage[] = []
  const re = /^\s+([\w./\-]+)\s+(v[\w.+-]+)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    deps.push({ name: m[1], version: m[2], ecosystem: 'go' })
  }
  return deps
}

// Gemfile → Ruby gems
function parseGemfile(content: string): ExternalPackage[] {
  const deps: ExternalPackage[] = []
  const re = /^\s*gem\s+['"]([^'"]+)['"]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    deps.push({ name: m[1], ecosystem: 'gem' })
  }
  return deps
}

// pyproject.toml → Python deps (PEP 621)
function parsePyprojectToml(content: string): ExternalPackage[] {
  const deps: ExternalPackage[] = []
  const section = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const re = /["']([a-zA-Z][\w.-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    deps.push({ name: m[1], ecosystem: 'pip' })
  }
  return deps
}

export const MANIFEST_FILES: Record<string, (content: string) => ExternalPackage[]> = {
  'package.json': parsePackageJson,
  'requirements.txt': parseRequirementsTxt,
  'Cargo.toml': parseCargotoml,
  'go.mod': parseGoMod,
  Gemfile: parseGemfile,
  'pyproject.toml': parsePyprojectToml,
}

export function parseManifests(
  files: Array<{ path: string; content: string }>,
): ExternalPackage[] {
  const results: ExternalPackage[] = []
  for (const file of files) {
    const fileName = file.path.split('/').pop() ?? ''
    const parser = MANIFEST_FILES[fileName]
    if (parser) {
      results.push(...parser(file.content))
    }
  }
  // deduplicate by name
  const seen = new Set<string>()
  return results.filter((p) => {
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })
}
```

- [ ] **Step 3: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/utils/depParsers.ts src/features/repo-explorer/utils/packageParsers.ts
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): multi-language dependency parsers"
```

---

## Task 5: IndexedDB storage for repo data

**Files:**
- Create: `src/features/repo-explorer/utils/repoDb.ts`

**Interfaces:**
- Consumes: `RepoMeta`, `RepoFile`, `RepoGraph`, `WikiPage` from `../types`
- Produces: `saveRepo()`, `loadRepo()`, `saveEmbeddings()`, `loadEmbeddings()`, `saveWikiPage()`, `loadWikiPage()`, `listRepos()`, `deleteRepo()`

- [ ] **Step 1: Create repoDb**

Create `src/features/repo-explorer/utils/repoDb.ts`:

```typescript
import { openDB, type IDBPDatabase } from 'idb'
import type { RepoMeta, RepoFile, RepoGraph, WikiPage } from '../types'

const DB_NAME = 'repo-explorer'
const DB_VERSION = 1

const STORES = {
  meta: 'repo_meta',
  files: 'repo_files',
  graph: 'repo_graph',
  embeddings: 'repo_embeddings',
  wiki: 'repo_wiki',
} as const

function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store)
        }
      }
    },
  })
  return _db
}

export async function saveRepo(meta: RepoMeta, files: RepoFile[], graph: RepoGraph): Promise<void> {
  const db = await getDB()
  const key = repoKey(meta.owner, meta.repo)
  const tx = db.transaction([STORES.meta, STORES.files, STORES.graph], 'readwrite')
  await tx.objectStore(STORES.meta).put(meta, key)
  await tx.objectStore(STORES.files).put(files, key)
  await tx.objectStore(STORES.graph).put(graph, key)
  await tx.done
}

export async function loadRepo(owner: string, repo: string): Promise<{
  meta: RepoMeta
  files: RepoFile[]
  graph: RepoGraph
} | null> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const [meta, files, graph] = await Promise.all([
    db.get(STORES.meta, key) as Promise<RepoMeta | undefined>,
    db.get(STORES.files, key) as Promise<RepoFile[] | undefined>,
    db.get(STORES.graph, key) as Promise<RepoGraph | undefined>,
  ])
  if (!meta || !files || !graph) return null
  return { meta, files, graph }
}

export async function saveEmbeddings(
  owner: string,
  repo: string,
  embeddings: Map<string, number[]>,
): Promise<void> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  // Convert Map to plain object for IDB storage
  await db.put(STORES.embeddings, Object.fromEntries(embeddings), key)
}

export async function loadEmbeddings(
  owner: string,
  repo: string,
): Promise<Map<string, number[]> | null> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const raw = await db.get(STORES.embeddings, key) as Record<string, number[]> | undefined
  if (!raw) return null
  return new Map(Object.entries(raw))
}

export async function saveWikiPage(
  owner: string,
  repo: string,
  page: WikiPage,
): Promise<void> {
  const db = await getDB()
  const key = `${repoKey(owner, repo)}::${page.path}`
  await db.put(STORES.wiki, page, key)
}

export async function loadWikiPage(
  owner: string,
  repo: string,
  path: string,
): Promise<WikiPage | null> {
  const db = await getDB()
  const key = `${repoKey(owner, repo)}::${path}`
  return (await db.get(STORES.wiki, key) as WikiPage | undefined) ?? null
}

export async function listRepos(): Promise<RepoMeta[]> {
  const db = await getDB()
  return (await db.getAll(STORES.meta)) as RepoMeta[]
}

export async function deleteRepo(owner: string, repo: string): Promise<void> {
  const db = await getDB()
  const key = repoKey(owner, repo)
  const tx = db.transaction(
    [STORES.meta, STORES.files, STORES.graph, STORES.embeddings],
    'readwrite',
  )
  await Promise.all([
    tx.objectStore(STORES.meta).delete(key),
    tx.objectStore(STORES.files).delete(key),
    tx.objectStore(STORES.graph).delete(key),
    tx.objectStore(STORES.embeddings).delete(key),
  ])
  await tx.done
  // wiki pages have composite keys — delete by prefix
  const wikiDb = await getDB()
  const allWikiKeys = await wikiDb.getAllKeys(STORES.wiki) as string[]
  const prefix = `${key}::`
  const toDelete = allWikiKeys.filter((k) => k.startsWith(prefix))
  const wikiTx = wikiDb.transaction(STORES.wiki, 'readwrite')
  await Promise.all(toDelete.map((k) => wikiTx.store.delete(k)))
  await wikiTx.done
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/utils/repoDb.ts
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): IndexedDB storage layer per repo"
```

---

## Task 6: GitHub fetcher hook

**Files:**
- Create: `src/features/repo-explorer/hooks/useGitHubFetcher.ts`

**Interfaces:**
- Consumes: `fetchRepoMeta`, `fetchRepoTree`, `fetchFilesBatched`, `buildRepoMeta` from `../utils/githubApi`; `isBinary`, `detectLanguage` from `../utils/languageDetect`; `buildEdges` from `../utils/depParsers`; `parseManifests` from `../utils/packageParsers`; `saveRepo` from `../utils/repoDb`; `useIndexingStore`
- Produces: `useFetchRepo()` returning `{ fetchRepo, loading, error }`

- [ ] **Step 1: Create useGitHubFetcher**

Create `src/features/repo-explorer/hooks/useGitHubFetcher.ts`:

```typescript
import { useCallback, useState } from 'react'
import { parseGitHubUrl, fetchRepoMeta, fetchRepoTree, fetchFilesBatched, buildRepoMeta } from '../utils/githubApi'
import { isBinary, detectLanguage } from '../utils/languageDetect'
import { buildEdges } from '../utils/depParsers'
import { parseManifests } from '../utils/packageParsers'
import { saveRepo } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import type { RepoFile, DepNode, DepEdge, RepoGraph, RepoIndexedData } from '../types'

export function useGitHubFetcher() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const indexing = useIndexingStore()

  const fetchRepo = useCallback(async (
    url: string,
    token?: string,
  ): Promise<RepoIndexedData | null> => {
    setLoading(true)
    setError(null)

    const parsed = parseGitHubUrl(url)
    if (!parsed) {
      setError('Invalid GitHub URL. Expected: https://github.com/owner/repo')
      setLoading(false)
      return null
    }

    const { owner, repo } = parsed
    const abortCtrl = new AbortController()
    indexing.start(`Fetching ${owner}/${repo}`, () => abortCtrl.abort())

    try {
      // 1. Repo metadata
      indexing.setPhase('fetching', `Fetching ${owner}/${repo} metadata…`)
      const { defaultBranch } = await fetchRepoMeta(owner, repo, token)

      // 2. File tree
      indexing.setPhase('fetching', `Scanning file tree…`)
      const treeItems = await fetchRepoTree(owner, repo, defaultBranch, token)

      // Filter binaries
      const textItems = treeItems.filter((item) => !isBinary(item.path))

      if (textItems.length > 500) {
        indexing.setPhase('fetching', `Large repo: fetching ${textItems.length} files…`)
      }

      const paths = textItems.map((i) => i.path)

      // 3. Fetch file contents
      indexing.setPhase('fetching', `Fetching file contents…`)
      const contentMap = await fetchFilesBatched(
        owner, repo, paths, token,
        (done, total) => {
          indexing.setProgress(done, total)
        },
        abortCtrl.signal,
      )

      if (abortCtrl.signal.aborted) {
        setLoading(false)
        return null
      }

      // 4. Build RepoFile array
      const files: RepoFile[] = []
      for (const [path, content] of contentMap) {
        if (!content) continue
        const lang = detectLanguage(path)
        files.push({
          path,
          content,
          language: lang.name,
          sizeBytes: content.length,
        })
      }

      // 5. Parse dependencies
      indexing.setPhase('parsing', 'Parsing dependencies…')
      const rawEdges = buildEdges(files)
      const externalPackages = parseManifests(files)

      // Build graph
      const internalNodeIds = new Set(files.map((f) => f.path))
      const externalNodeIds = new Set(rawEdges.filter((e) => e.external).map((e) => e.target))

      const nodes: DepNode[] = [
        ...files.map((f): DepNode => {
          const langInfo = detectLanguage(f.path)
          return {
            id: f.path,
            label: f.path.split('/').pop() ?? f.path,
            type: 'internal',
            language: f.language,
            color: langInfo.color,
            path: f.path,
          }
        }),
        ...[...externalNodeIds].map((pkgId): DepNode => {
          const pkgName = pkgId.replace('pkg:', '')
          const found = externalPackages.find((p) => p.name === pkgName)
          return {
            id: pkgId,
            label: pkgName,
            type: 'external',
            language: found?.ecosystem ?? 'package',
            color: '#4a5568',
            packageName: pkgName,
          }
        }),
      ]

      const edges: DepEdge[] = rawEdges.map((e, i): DepEdge => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
      }))

      const graph: RepoGraph = { nodes, edges }

      // 6. Determine languages
      const languageSet = new Set(files.map((f) => f.language).filter((l) => l !== 'Unknown'))
      const languages = [...languageSet]

      // 7. Build meta
      const meta = buildRepoMeta(owner, repo, defaultBranch, languages, files.length, token)

      // 8. Save to IndexedDB
      indexing.setPhase('embedding', 'Saving to storage…')
      await saveRepo(meta, files, graph)

      indexing.finish()
      setLoading(false)

      return { meta, files, graph }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg === 'AUTH_REQUIRED') {
        setError('Private repo or rate limit. Add a GitHub token in the input.')
      } else if (msg === 'REPO_NOT_FOUND') {
        setError('Repository not found. Check the URL.')
      } else {
        setError(msg)
      }
      indexing.setError(msg)
      setLoading(false)
      return null
    }
  }, [indexing])

  return { fetchRepo, loading, error }
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/hooks/useGitHubFetcher.ts
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): GitHub fetcher hook with global progress"
```

---

## Task 7: Indexer hook (embeddings)

**Files:**
- Create: `src/features/repo-explorer/hooks/useIndexer.ts`

**Interfaces:**
- Consumes: `getEmbedder`, `embedBatch` from `@/features/rag-studio/utils/embed`; `saveEmbeddings`, `loadEmbeddings` from `../utils/repoDb`; `useIndexingStore`
- Produces: `useIndexer()` returning `{ indexFiles, loadIndex, embeddings }`

- [ ] **Step 1: Create useIndexer**

Create `src/features/repo-explorer/hooks/useIndexer.ts`:

```typescript
import { useCallback, useState } from 'react'
import { getEmbedder } from '@/features/rag-studio/utils/embed'
import { embed } from '@/features/rag-studio/utils/embed'
import { saveEmbeddings, loadEmbeddings } from '../utils/repoDb'
import { useIndexingStore } from '@/store/indexingStore'
import type { RepoFile } from '../types'

export function useIndexer() {
  const [embeddings, setEmbeddings] = useState<Map<string, number[]>>(new Map())
  const indexing = useIndexingStore()

  const loadIndex = useCallback(async (owner: string, repo: string): Promise<boolean> => {
    const stored = await loadEmbeddings(owner, repo)
    if (!stored) return false
    setEmbeddings(stored)
    return true
  }, [])

  const indexFiles = useCallback(async (
    owner: string,
    repo: string,
    files: RepoFile[],
  ): Promise<Map<string, number[]>> => {
    indexing.setPhase('embedding', 'Loading embedding model…')

    // Boot embedder (downloads model on first run, cached after)
    await getEmbedder((pct) => {
      indexing.setProgress(pct, 100)
    })

    indexing.setPhase('embedding', 'Embedding files…')
    indexing.setProgress(0, files.length)

    const result = new Map<string, number[]>()
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Use first 1500 chars for embedding (matches RAG chunk size)
      const text = `File: ${file.path}\n\n${file.content.slice(0, 1500)}`
      try {
        const vec = await embed(text)
        result.set(file.path, vec)
      } catch {
        // skip files that fail to embed
      }
      indexing.setProgress(i + 1, files.length)
    }

    await saveEmbeddings(owner, repo, result)
    setEmbeddings(result)
    indexing.finish()
    return result
  }, [indexing])

  return { indexFiles, loadIndex, embeddings }
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/hooks/useIndexer.ts
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): file embedding + IndexedDB persistence hook"
```

---

## Task 8: React Flow graph view

**Files:**
- Create: `src/features/repo-explorer/components/GraphView.tsx`

**Interfaces:**
- Consumes: `RepoGraph`, `DepNode`, `DepEdge` from `../types`; `@xyflow/react`
- Produces: `<GraphView>` component, emits `onNodeClick(path: string)`

- [ ] **Step 1: Create GraphView**

Create `src/features/repo-explorer/components/GraphView.tsx`:

```typescript
import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import type { RepoGraph } from '../types'

interface Props {
  graph: RepoGraph
  onNodeClick: (path: string) => void
  selectedNode: string | null
}

function buildFlowNodes(graph: RepoGraph): Node[] {
  // Simple grid layout — React Flow will let user drag
  const internals = graph.nodes.filter((n) => n.type === 'internal')
  const externals = graph.nodes.filter((n) => n.type === 'external')
  const cols = Math.ceil(Math.sqrt(internals.length))

  return [
    ...internals.map((n, i): Node => ({
      id: n.id,
      position: { x: (i % cols) * 200, y: Math.floor(i / cols) * 120 },
      data: { label: n.label, color: n.color, type: 'internal' },
      type: 'default',
      style: {
        background: n.color + '22',
        borderColor: n.color,
        borderWidth: 1.5,
        borderRadius: '0.5rem',
        color: 'var(--on-surface)',
        fontSize: '0.7rem',
        padding: '4px 8px',
        minWidth: '80px',
        maxWidth: '160px',
      },
    })),
    ...externals.map((n, i): Node => ({
      id: n.id,
      position: { x: cols * 200 + 120, y: i * 60 },
      data: { label: n.label, type: 'external' },
      type: 'default',
      style: {
        background: 'var(--surface-raised)',
        borderColor: 'var(--border)',
        borderWidth: 1,
        borderRadius: '0.25rem',
        color: 'var(--on-surface-muted)',
        fontSize: '0.65rem',
        padding: '2px 6px',
      },
    })),
  ]
}

function buildFlowEdges(graph: RepoGraph): Edge[] {
  return graph.edges.map((e): Edge => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: 'var(--border)', strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border)', width: 12, height: 12 },
  }))
}

export default function GraphView({ graph, onNodeClick, selectedNode }: Props) {
  const [showExternal, setShowExternal] = useState(false)

  const filteredGraph = useMemo(() => {
    if (showExternal) return graph
    return {
      nodes: graph.nodes.filter((n) => n.type === 'internal'),
      edges: graph.edges.filter((e) => !e.target.startsWith('pkg:')),
    }
  }, [graph, showExternal])

  const initialNodes = useMemo(() => buildFlowNodes(filteredGraph), [filteredGraph])
  const initialEdges = useMemo(() => buildFlowEdges(filteredGraph), [filteredGraph])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      const graphNode = graph.nodes.find((n) => n.id === node.id)
      if (graphNode?.path) onNodeClick(graphNode.path)
    },
    [graph.nodes, onNodeClick],
  )

  const languages = useMemo(() => {
    const langs = new Map<string, string>()
    graph.nodes
      .filter((n) => n.type === 'internal')
      .forEach((n) => langs.set(n.language, n.color))
    return langs
  }, [graph.nodes])

  return (
    <div className="relative flex-1 min-h-0 bg-surface">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setShowExternal((v) => !v)}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md border transition-colors duration-150',
            showExternal
              ? 'bg-accent text-accent-text border-accent'
              : 'bg-surface border-border text-on-surface-muted hover:text-on-surface hover:border-accent',
          )}
        >
          {showExternal ? 'Hide' : 'Show'} external packages
        </button>
        <span className="text-xs text-on-surface-muted">
          {filteredGraph.nodes.length} nodes · {filteredGraph.edges.length} edges
        </span>
      </div>

      {/* Language legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 max-w-xs">
        {[...languages.entries()].slice(0, 8).map(([lang, color]) => (
          <span key={lang} className="flex items-center gap-1 text-[0.6rem] text-on-surface-muted">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            {lang}
          </span>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        <Controls
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
        />
        <MiniMap
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
          maskColor="var(--surface)88"
        />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/components/GraphView.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): React Flow dependency graph view"
```

---

## Task 9: Wiki generator hook + NodeDetailPanel

**Files:**
- Create: `src/features/repo-explorer/hooks/useWikiGen.ts`
- Create: `src/features/repo-explorer/components/NodeDetailPanel.tsx`

**Interfaces:**
- Consumes: `getEngine`, `complete` from `@/features/rag-studio/utils/llm`; `saveWikiPage`, `loadWikiPage` from `../utils/repoDb`; `useSettingsStore`; `parseMarkdown` from markdown-studio
- Produces: `useWikiGen()` returning `{ generateWiki, wikiPages }`, `<NodeDetailPanel>`

- [ ] **Step 1: Create useWikiGen**

Create `src/features/repo-explorer/hooks/useWikiGen.ts`:

```typescript
import { useCallback, useState } from 'react'
import { complete } from '@/features/rag-studio/utils/llm'
import { saveWikiPage, loadWikiPage } from '../utils/repoDb'
import { useSettingsStore } from '@/store/settingsStore'
import type { WikiPage, RepoFile } from '../types'

function wikiPrompt(file: RepoFile): string {
  const snippet = file.content.slice(0, 3000)
  return `You are a code documentation assistant. Analyze the following source file and produce a wiki page in markdown.

File: ${file.path}
Language: ${file.language}

\`\`\`
${snippet}
\`\`\`

Write a wiki page with these sections (use markdown headers):
## Summary
(2-3 sentences: what this file does, its role in the codebase)

## Key Exports / Functions / Classes
(bullet list of the most important exports, classes, or functions with 1-line descriptions each)

## Dependencies
(bullet list of what this file imports from, internal and external)

## Usage Notes
(any important patterns, caveats, or things a developer should know)

RETURN ONLY MARKDOWN. No preamble.`
}

export function useWikiGen() {
  const [wikiPages, setWikiPages] = useState<Map<string, WikiPage>>(new Map())
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)

  const generateWiki = useCallback(async (
    owner: string,
    repo: string,
    file: RepoFile,
  ): Promise<WikiPage | null> => {
    // Check cache
    const cached = wikiPages.get(file.path)
    if (cached) return cached

    const dbCached = await loadWikiPage(owner, repo, file.path)
    if (dbCached) {
      setWikiPages((prev) => new Map(prev).set(file.path, dbCached))
      return dbCached
    }

    if (generating.has(file.path)) return null

    setGenerating((prev) => new Set(prev).add(file.path))
    try {
      const content = await complete(ragLlmModel, [
        { role: 'user', content: wikiPrompt(file) },
      ], { max_tokens: 1024 })

      const page: WikiPage = {
        path: file.path,
        content,
        generatedAt: Date.now(),
      }

      await saveWikiPage(owner, repo, page)
      setWikiPages((prev) => new Map(prev).set(file.path, page))
      return page
    } catch {
      return null
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev)
        next.delete(file.path)
        return next
      })
    }
  }, [wikiPages, generating, ragLlmModel])

  return { generateWiki, wikiPages, generating }
}
```

- [ ] **Step 2: Create NodeDetailPanel**

Create `src/features/repo-explorer/components/NodeDetailPanel.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import { X, BookOpen, Code2, Loader2 } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'
import type { RepoFile, RepoMeta, WikiPage } from '../types'
import type { useWikiGen } from '../hooks/useWikiGen'

type WikiGenReturn = ReturnType<typeof useWikiGen>

interface Props {
  file: RepoFile | null
  meta: RepoMeta | null
  wikiPages: WikiGenReturn['wikiPages']
  generating: WikiGenReturn['generating']
  onGenerateWiki: (file: RepoFile) => void
  onClose: () => void
}

type Tab = 'wiki' | 'code'

export default function NodeDetailPanel({
  file,
  meta,
  wikiPages,
  generating,
  onGenerateWiki,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('wiki')
  const wikiRef = useRef<HTMLDivElement>(null)

  const wikiPage: WikiPage | undefined = file ? wikiPages.get(file.path) : undefined
  const isGenerating = file ? generating.has(file.path) : false

  useEffect(() => {
    if (!wikiRef.current || !wikiPage) return
    wikiRef.current.innerHTML = parseMarkdown(wikiPage.content)
    postProcessPreview(wikiRef.current)
  }, [wikiPage])

  useEffect(() => {
    if (file && tab === 'wiki' && !wikiPage && !isGenerating) {
      onGenerateWiki(file)
    }
  }, [file, tab, wikiPage, isGenerating, onGenerateWiki])

  if (!file) return null

  const monacoLang = file.language.toLowerCase().replace('c++', 'cpp').replace('c#', 'csharp')

  const TAB_CLS = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150'

  return (
    <div className="w-[28rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="flex-1 text-xs text-on-surface truncate font-mono">{file.path}</span>
        <button
          onClick={onClose}
          className="text-on-surface-muted hover:text-on-surface transition-colors duration-150"
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-border shrink-0">
        <button
          onClick={() => setTab('wiki')}
          className={cn(TAB_CLS, tab === 'wiki'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
        >
          <BookOpen size={12} className="inline mr-1.5 -mt-px" />
          Wiki
        </button>
        <button
          onClick={() => setTab('code')}
          className={cn(TAB_CLS, tab === 'code'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
        >
          <Code2 size={12} className="inline mr-1.5 -mt-px" />
          Code
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'wiki' ? (
          <div className="p-4">
            {isGenerating ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-muted py-8 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Generating wiki page…
              </div>
            ) : wikiPage ? (
              <div ref={wikiRef} className="markdown-preview text-sm" />
            ) : (
              <div className="text-sm text-on-surface-muted py-8 text-center">
                <p>No wiki page yet.</p>
                <button
                  onClick={() => onGenerateWiki(file)}
                  className="mt-2 text-accent hover:text-accent-hover text-xs transition-colors duration-150"
                >
                  Generate now
                </button>
              </div>
            )}
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={monacoLang}
            value={file.content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
            }}
            theme="vs-dark"
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-[0.6rem] text-on-surface-muted">
          {file.language} · {(file.sizeBytes / 1024).toFixed(1)} KB
        </span>
        {wikiPage && (
          <span className="text-[0.6rem] text-on-surface-muted">
            Generated {new Date(wikiPage.generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/hooks/useWikiGen.ts src/features/repo-explorer/components/NodeDetailPanel.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): wiki generator hook + node detail panel"
```

---

## Task 10: Wiki view + repo sidebar

**Files:**
- Create: `src/features/repo-explorer/components/RepoSidebar.tsx`
- Create: `src/features/repo-explorer/components/WikiView.tsx`

**Interfaces:**
- Consumes: `RepoFile`, `RepoMeta` from `../types`; `detectLanguage` from `../utils/languageDetect`
- Produces: `<RepoSidebar>`, `<WikiView>`

- [ ] **Step 1: Create RepoSidebar**

Create `src/features/repo-explorer/components/RepoSidebar.tsx`:

```typescript
import { useState } from 'react'
import { ChevronRight, ChevronDown, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectLanguage } from '../utils/languageDetect'
import type { RepoFile } from '../types'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
  file?: RepoFile
}

function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    let cumPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cumPath = cumPath ? `${cumPath}/${part}` : part
      const isLast = i === parts.length - 1

      let node = current.find((n) => n.name === part)
      if (!node) {
        node = {
          name: part,
          path: cumPath,
          type: isLast ? 'file' : 'dir',
          children: isLast ? undefined : [],
          file: isLast ? file : undefined,
        }
        current.push(node)
      }
      if (!isLast) current = node.children!
    }
  }

  return sortTree(root)
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => ({ ...n, children: n.children ? sortTree(n.children) : undefined }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

interface TreeNodeProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (file: RepoFile) => void
}

function TreeItem({ node, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2)
  const isSelected = node.path === selectedPath
  const lang = node.type === 'file' ? detectLanguage(node.path) : null

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-on-surface-muted',
            'hover:text-on-surface hover:bg-surface-hover transition-colors duration-150 rounded',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span className="font-medium">{node.name}/</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => node.file && onSelect(node.file)}
      className={cn(
        'w-full flex items-center gap-1.5 py-0.5 text-xs transition-colors duration-150 rounded',
        isSelected
          ? 'bg-accent/10 text-accent'
          : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {lang ? (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lang.color }} />
      ) : (
        <File size={11} />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface Props {
  files: RepoFile[]
  selectedPath: string | null
  onSelect: (file: RepoFile) => void
}

export default function RepoSidebar({ files, selectedPath, onSelect }: Props) {
  const tree = buildTree(files)

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-surface overflow-y-auto">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-[0.65rem] font-semibold text-on-surface-muted uppercase tracking-widest">
          Files ({files.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create WikiView**

Create `src/features/repo-explorer/components/WikiView.tsx`:

```typescript
import RepoSidebar from './RepoSidebar'
import NodeDetailPanel from './NodeDetailPanel'
import type { RepoFile, RepoMeta } from '../types'
import type { useWikiGen } from '../hooks/useWikiGen'

type WikiGenReturn = ReturnType<typeof useWikiGen>

interface Props {
  files: RepoFile[]
  meta: RepoMeta
  selectedFile: RepoFile | null
  wikiPages: WikiGenReturn['wikiPages']
  generating: WikiGenReturn['generating']
  onSelectFile: (file: RepoFile) => void
  onGenerateWiki: (file: RepoFile) => void
}

export default function WikiView({
  files,
  meta,
  selectedFile,
  wikiPages,
  generating,
  onSelectFile,
  onGenerateWiki,
}: Props) {
  return (
    <div className="flex flex-1 min-h-0">
      <RepoSidebar
        files={files}
        selectedPath={selectedFile?.path ?? null}
        onSelect={onSelectFile}
      />
      <div className="flex-1 min-w-0">
        <NodeDetailPanel
          file={selectedFile}
          meta={meta}
          wikiPages={wikiPages}
          generating={generating}
          onGenerateWiki={onGenerateWiki}
          onClose={() => onSelectFile(files[0])}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/components/RepoSidebar.tsx src/features/repo-explorer/components/WikiView.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): wiki view + file tree sidebar"
```

---

## Task 11: Chat panel + repo chat hook

**Files:**
- Create: `src/features/repo-explorer/hooks/useRepoChat.ts`
- Create: `src/features/repo-explorer/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: `streamComplete` from `@/features/rag-studio/utils/llm`; `embed` from `@/features/rag-studio/utils/embed`; `useSettingsStore`; `embeddings` from `useIndexer`; `RepoFile`
- Produces: `useRepoChat()` returning `{ messages, sendMessage, disabled }`, `<ChatPanel>`

- [ ] **Step 1: Create useRepoChat**

Create `src/features/repo-explorer/hooks/useRepoChat.ts`:

```typescript
import { useCallback, useState } from 'react'
import { streamComplete } from '@/features/rag-studio/utils/llm'
import { embed } from '@/features/rag-studio/utils/embed'
import { useSettingsStore } from '@/store/settingsStore'
import type { RepoFile, RepoMeta } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
  timestamp: number
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function retrieveTopK(
  queryVec: number[],
  embeddings: Map<string, number[]>,
  files: RepoFile[],
  k = 5,
): RepoFile[] {
  const fileMap = new Map(files.map((f) => [f.path, f]))
  const scored = [...embeddings.entries()]
    .map(([path, vec]) => ({ path, score: cosineSim(queryVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  return scored.map((s) => fileMap.get(s.path)).filter(Boolean) as RepoFile[]
}

function buildContext(files: RepoFile[]): string {
  let budget = 4000
  let ctx = ''
  for (const f of files) {
    const snippet = `=== ${f.path} ===\n${f.content.slice(0, 800)}`
    if (snippet.length > budget) break
    ctx += snippet + '\n\n'
    budget -= snippet.length
  }
  return ctx
}

export function useRepoChat(
  meta: RepoMeta | null,
  files: RepoFile[],
  embeddings: Map<string, number[]>,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [disabled, setDisabled] = useState(false)
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)

  const sendMessage = useCallback(async (text: string) => {
    if (disabled || !meta) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    const aiId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiId,
      role: 'ai',
      content: '',
      streaming: true,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    setDisabled(true)

    try {
      const queryVec = await embed(text)
      const topFiles = retrieveTopK(queryVec, embeddings, files)
      const context = buildContext(topFiles)

      const systemPrompt = `You are a code assistant for the ${meta.owner}/${meta.repo} repository.
Answer questions about the codebase using the file excerpts below.
If the answer is not in the context, say so honestly.

${context.trim()}`

      for await (const delta of streamComplete(
        ragLlmModel,
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        { max_tokens: 1024 },
      )) {
        setMessages((prev) =>
          prev.map((m) => m.id === aiId ? { ...m, content: m.content + delta } : m),
        )
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: 'Error generating response.', streaming: false } : m,
        ),
      )
      console.error('Chat error', err)
    } finally {
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, streaming: false } : m))
      setDisabled(false)
    }
  }, [disabled, meta, files, embeddings, ragLlmModel])

  return { messages, sendMessage, disabled }
}
```

- [ ] **Step 2: Create ChatPanel**

Create `src/features/repo-explorer/components/ChatPanel.tsx`:

```typescript
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '../hooks/useRepoChat'

interface Props {
  messages: ChatMessage[]
  disabled: boolean
  onSend: (text: string) => void
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  function handleSend(e?: FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSend(text)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={cn(
      'shrink-0 border-t border-border bg-surface flex flex-col transition-[height] duration-200',
      open ? 'h-72' : 'h-9',
    )}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 w-full"
      >
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        <span>Ask about this repo</span>
        {messages.length > 0 && (
          <span className="ml-auto text-accent">{messages.length} messages</span>
        )}
      </button>

      {open && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2 min-h-0">
            {messages.length === 0 && (
              <p className="text-xs text-on-surface-muted text-center py-4">
                Ask anything about the repository…
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'text-xs rounded-lg px-3 py-2 max-w-[85%]',
                  msg.role === 'user'
                    ? 'bg-accent/10 text-on-surface self-end'
                    : 'bg-surface-raised text-on-surface self-start border border-border',
                )}
              >
                {msg.content || (msg.streaming ? '…' : '')}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-end gap-2 px-4 py-2 border-t border-border shrink-0">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about the codebase…"
              rows={1}
              disabled={disabled}
              className={cn(
                'flex-1 bg-surface-raised border border-border rounded-lg px-3 py-1.5',
                'text-xs text-on-surface placeholder:text-on-surface-muted resize-none',
                'focus:border-accent outline-none transition-colors duration-150',
                'disabled:opacity-50',
              )}
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className={cn(
                'p-1.5 rounded-lg transition-colors duration-150',
                'bg-accent text-accent-text hover:bg-accent-hover',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Send size={12} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/hooks/useRepoChat.ts src/features/repo-explorer/components/ChatPanel.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): repo chat panel with semantic retrieval"
```

---

## Task 12: Main orchestration hook + RepoInput + ViewToggle

**Files:**
- Create: `src/features/repo-explorer/hooks/useRepoExplorer.ts`
- Create: `src/features/repo-explorer/components/RepoInput.tsx`
- Create: `src/features/repo-explorer/components/ViewToggle.tsx`

**Interfaces:**
- Consumes: all hooks created in previous tasks
- Produces: `useRepoExplorer()`, `<RepoInput>`, `<ViewToggle>`

- [ ] **Step 1: Create useRepoExplorer (main orchestration)**

Create `src/features/repo-explorer/hooks/useRepoExplorer.ts`:

```typescript
import { useCallback, useState } from 'react'
import { useGitHubFetcher } from './useGitHubFetcher'
import { useIndexer } from './useIndexer'
import { useWikiGen } from './useWikiGen'
import { useRepoChat } from './useRepoChat'
import { loadRepo } from '../utils/repoDb'
import type { RepoFile, RepoGraph, RepoMeta, ExplorerView } from '../types'

export function useRepoExplorer() {
  const [meta, setMeta] = useState<RepoMeta | null>(null)
  const [files, setFiles] = useState<RepoFile[]>([])
  const [graph, setGraph] = useState<RepoGraph>({ nodes: [], edges: [] })
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null)
  const [view, setView] = useState<ExplorerView>('graph')

  const { fetchRepo, loading: fetching, error: fetchError } = useGitHubFetcher()
  const { indexFiles, loadIndex, embeddings } = useIndexer()
  const { generateWiki, wikiPages, generating } = useWikiGen()
  const chat = useRepoChat(meta, files, embeddings)

  const loadExistingRepo = useCallback(async (owner: string, repo: string) => {
    const stored = await loadRepo(owner, repo)
    if (!stored) return false
    setMeta(stored.meta)
    setFiles(stored.files)
    setGraph(stored.graph)
    // Load embeddings from DB
    await loadIndex(owner, repo)
    return true
  }, [loadIndex])

  const handleFetch = useCallback(async (url: string, token?: string) => {
    // Try loading from cache first
    const parsed = url.match(/github\.com\/([^/]+)\/([^/?\s#]+)/)
    if (parsed) {
      const [, owner, repo] = parsed
      const loaded = await loadExistingRepo(owner, repo.replace(/\.git$/, ''))
      if (loaded) return
    }

    const data = await fetchRepo(url, token)
    if (!data) return

    setMeta(data.meta)
    setFiles(data.files)
    setGraph(data.graph)

    // Index in background (updates indexingStore footer)
    await indexFiles(data.meta.owner, data.meta.repo, data.files)
  }, [fetchRepo, indexFiles, loadExistingRepo])

  const handleSelectFile = useCallback((file: RepoFile) => {
    setSelectedFile(file)
  }, [])

  const handleGenerateWiki = useCallback((file: RepoFile) => {
    if (!meta) return
    generateWiki(meta.owner, meta.repo, file)
  }, [meta, generateWiki])

  const fileMap = new Map(files.map((f) => [f.path, f]))

  const handleNodeClick = useCallback((path: string) => {
    const file = fileMap.get(path)
    if (file) setSelectedFile(file)
  }, [fileMap])

  return {
    meta, files, graph, selectedFile, view, setView,
    fetching, fetchError,
    embeddings,
    wikiPages, generating,
    chat,
    handleFetch,
    handleSelectFile,
    handleGenerateWiki,
    handleNodeClick,
  }
}
```

- [ ] **Step 2: Create RepoInput**

Create `src/features/repo-explorer/components/RepoInput.tsx`:

```typescript
import { useState, type FormEvent } from 'react'
import { Github, Key, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onFetch: (url: string, token?: string) => void
  loading: boolean
  error: string | null
}

export default function RepoInput({ onFetch, loading, error }: Props) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim() || loading) return
    onFetch(url.trim(), token.trim() || undefined)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <Github size={40} className="text-on-surface-muted" />
        <h1 className="text-xl font-semibold text-on-surface">Repo Explorer</h1>
        <p className="text-sm text-on-surface-muted text-center max-w-md">
          Paste any public GitHub repo URL to explore its dependency graph and get AI-powered code explanations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            className={cn(
              'flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2',
              'text-sm text-on-surface placeholder:text-on-surface-muted',
              'focus:border-accent outline-none transition-colors duration-150',
              'disabled:opacity-50',
            )}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
              'bg-accent text-accent-text hover:bg-accent-hover',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'flex items-center gap-2',
            )}
          >
            <Search size={14} />
            {loading ? 'Fetching…' : 'Explore'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowToken((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-on-surface-muted hover:text-on-surface transition-colors duration-150 self-start"
        >
          <Key size={11} />
          {showToken ? 'Hide' : 'Add'} GitHub token (for rate limits / private repos)
        </button>

        {showToken && (
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            className={cn(
              'bg-surface-raised border border-border rounded-lg px-3 py-2',
              'text-sm text-on-surface placeholder:text-on-surface-muted',
              'focus:border-accent outline-none transition-colors duration-150',
            )}
          />
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </form>

      <div className="text-xs text-on-surface-muted text-center">
        <p>Files are indexed locally in your browser. Nothing is sent to any server.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ViewToggle**

Create `src/features/repo-explorer/components/ViewToggle.tsx`:

```typescript
import { GitGraph, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExplorerView } from '../types'

interface Props {
  view: ExplorerView
  onChange: (view: ExplorerView) => void
  repoLabel: string
}

export default function ViewToggle({ view, onChange, repoLabel }: Props) {
  const BTN = 'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors duration-150'
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-surface">
      <span className="text-xs font-mono text-on-surface-muted">{repoLabel}</span>
      <div className="flex gap-1 bg-surface-raised rounded-lg p-0.5 border border-border">
        <button
          onClick={() => onChange('graph')}
          className={cn(BTN, view === 'graph'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface')}
        >
          <GitGraph size={12} />
          Graph
        </button>
        <button
          onClick={() => onChange('wiki')}
          className={cn(BTN, view === 'wiki'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface')}
        >
          <BookOpen size={12} />
          Wiki
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/hooks/useRepoExplorer.ts src/features/repo-explorer/components/RepoInput.tsx src/features/repo-explorer/components/ViewToggle.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): main orchestration hook + repo input + view toggle"
```

---

## Task 13: Page assembly + routing + HomePage

**Files:**
- Create: `src/features/repo-explorer/index.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: all components from `./components/`, `useRepoExplorer` from `./hooks/useRepoExplorer`

- [ ] **Step 1: Create page root**

Create `src/features/repo-explorer/index.tsx`:

```typescript
import { useRepoExplorer } from './hooks/useRepoExplorer'
import RepoInput from './components/RepoInput'
import GraphView from './components/GraphView'
import WikiView from './components/WikiView'
import NodeDetailPanel from './components/NodeDetailPanel'
import ViewToggle from './components/ViewToggle'
import ChatPanel from './components/ChatPanel'

export default function RepoExplorerPage() {
  const {
    meta, files, graph, selectedFile, view, setView,
    fetching, fetchError,
    wikiPages, generating,
    chat,
    handleFetch,
    handleSelectFile,
    handleGenerateWiki,
    handleNodeClick,
  } = useRepoExplorer()

  const hasRepo = meta !== null && files.length > 0

  return (
    <div className="studio-root">
      {!hasRepo ? (
        <RepoInput onFetch={handleFetch} loading={fetching} error={fetchError} />
      ) : (
        <>
          <ViewToggle
            view={view}
            onChange={setView}
            repoLabel={`${meta.owner}/${meta.repo}`}
          />

          <div className="flex flex-1 min-h-0">
            {view === 'graph' ? (
              <>
                <GraphView
                  graph={graph}
                  onNodeClick={handleNodeClick}
                  selectedNode={selectedFile?.path ?? null}
                />
                {selectedFile && (
                  <NodeDetailPanel
                    file={selectedFile}
                    meta={meta}
                    wikiPages={wikiPages}
                    generating={generating}
                    onGenerateWiki={handleGenerateWiki}
                    onClose={() => handleSelectFile(files[0])}
                  />
                )}
              </>
            ) : (
              <WikiView
                files={files}
                meta={meta}
                selectedFile={selectedFile}
                wikiPages={wikiPages}
                generating={generating}
                onSelectFile={handleSelectFile}
                onGenerateWiki={handleGenerateWiki}
              />
            )}
          </div>

          <ChatPanel
            messages={chat.messages}
            disabled={chat.disabled}
            onSend={chat.sendMessage}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add the import and route:

```typescript
import RepoExplorerPage from '@/features/repo-explorer'
```

Add inside the `<Route path="/" element={<AppShell />}>` block:
```typescript
<Route path="tools/repo-explorer" element={<RepoExplorerPage />} />
```

- [ ] **Step 3: Add card to HomePage**

In `src/pages/HomePage.tsx`, add to the `studios` array:

```typescript
{
  id: 'repo-explorer',
  title: 'Repo Explorer',
  description: 'Visualize dependency graphs and get AI-powered wiki pages for any public GitHub repository.',
  icon: <Network size={20} />,
  status: 'available',
  phase: 'Phase 5',
  href: '/tools/repo-explorer',
},
```

Add `Network` to the lucide-react import at the top of `HomePage.tsx`.

- [ ] **Step 4: Type check**

```bash
cd /Users/aayushgour/Desktop/projects/devtools/devhub && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Final commit**

```bash
git -C /Users/aayushgour/Desktop/projects/devtools/devhub add src/features/repo-explorer/index.tsx src/App.tsx src/pages/HomePage.tsx
git -C /Users/aayushgour/Desktop/projects/devtools/devhub commit -m "feat(repo-explorer): wire up page, route, and homepage card"
```

---

## Self-Review

**Spec coverage check:**
- ✅ GitHub URL input with optional token
- ✅ Fetch public repo via GitHub API
- ✅ Multi-language dep parsing (10+ languages, internal + external)
- ✅ React Flow graph view (default)
- ✅ Wiki view with file tree sidebar
- ✅ NodeDetailPanel: Wiki tab + Code tab (Monaco)
- ✅ On-demand AI wiki generation via WebLLM, cached in IndexedDB
- ✅ Semantic search + chat panel
- ✅ Indexing stored in IndexedDB per repo (loadRepo on revisit)
- ✅ Non-blocking global footer progress bar
- ✅ RAG Studio migrated to same footer
- ✅ Route + HomePage card

**Placeholder scan:** No TBDs, no TODOs, no "handle edge cases" without code.

**Type consistency:**
- `RepoFile` used consistently across all hooks/components
- `useWikiGen` return type referenced via `ReturnType<typeof useWikiGen>` in components
- `ExplorerView` exported from `types.ts`, used in `useRepoExplorer` and `ViewToggle`
- `ChatMessage` defined in `useRepoChat.ts`, imported in `ChatPanel.tsx`
