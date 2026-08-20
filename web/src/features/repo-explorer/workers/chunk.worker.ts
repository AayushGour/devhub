// Off-thread AST chunker. Parses each file with tree-sitter and splits it on
// top-level declaration boundaries into size-bounded chunks with exact line
// ranges. Falls back to a line-window chunker for unsupported languages, parse
// failures, or oversized nodes — so no file is ever dropped.

import { Parser, Language } from 'web-tree-sitter'
import type { Node } from 'web-tree-sitter'
import { lineWindowChunks, windowLines, CHUNK_WINDOW, type CodeChunk } from '../utils/chunkCode'

// Core runtime wasm + prebuilt grammar wasms (Vite emits these as assets; the
// `?url` string is cheap — the bytes are only fetched when a grammar is used).
import coreWasmUrl from 'web-tree-sitter/web-tree-sitter.wasm?url'
import cUrl from 'tree-sitter-wasms/out/tree-sitter-c.wasm?url'
import cppUrl from 'tree-sitter-wasms/out/tree-sitter-cpp.wasm?url'
import goUrl from 'tree-sitter-wasms/out/tree-sitter-go.wasm?url'
import javaUrl from 'tree-sitter-wasms/out/tree-sitter-java.wasm?url'
import jsUrl from 'tree-sitter-wasms/out/tree-sitter-javascript.wasm?url'
import phpUrl from 'tree-sitter-wasms/out/tree-sitter-php.wasm?url'
import pyUrl from 'tree-sitter-wasms/out/tree-sitter-python.wasm?url'
import rbUrl from 'tree-sitter-wasms/out/tree-sitter-ruby.wasm?url'
import rustUrl from 'tree-sitter-wasms/out/tree-sitter-rust.wasm?url'
import tsxUrl from 'tree-sitter-wasms/out/tree-sitter-tsx.wasm?url'
import tsUrl from 'tree-sitter-wasms/out/tree-sitter-typescript.wasm?url'

const GRAMMAR_URLS: Record<string, string> = {
  ts: tsUrl, tsx: tsxUrl,
  js: jsUrl, jsx: jsUrl, mjs: jsUrl, cjs: jsUrl,
  py: pyUrl, go: goUrl, rs: rustUrl, java: javaUrl,
  c: cUrl, h: cUrl,
  cpp: cppUrl, cc: cppUrl, cxx: cppUrl, hpp: cppUrl, hxx: cppUrl,
  rb: rbUrl, php: phpUrl,
}

const MAX_CHUNK_LINES = CHUNK_WINDOW * 2 // beyond this, a segment/node is windowed

let initPromise: Promise<void> | null = null
let parser: Parser | null = null
const langCache = new Map<string, Promise<Language>>()

async function ensureParser(): Promise<Parser> {
  if (!initPromise) initPromise = Parser.init({ locateFile: () => coreWasmUrl })
  await initPromise
  if (!parser) parser = new Parser()
  return parser
}

function loadLang(ext: string, url: string): Promise<Language> {
  let p = langCache.get(ext)
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => Language.load(new Uint8Array(buf)))
    langCache.set(ext, p)
  }
  return p
}

// Build size-bounded chunks that cover every line, breaking on top-level
// declaration boundaries. Big nodes/segments are windowed with overlap.
function astChunks(root: Node, content: string): CodeChunk[] {
  const lines = content.split('\n')
  const chunks: CodeChunk[] = []

  const pushSeg = (a: number, b: number) => {
    if (a > b) return
    if (b - a + 1 > MAX_CHUNK_LINES) {
      chunks.push(...windowLines(lines.slice(a - 1, b), a))
      return
    }
    const text = lines.slice(a - 1, b).join('\n')
    if (text.trim()) chunks.push({ startLine: a, endLine: b, text })
  }

  let segStart = 1 // next uncovered line (1-based)
  for (const node of root.namedChildren) {
    if (!node) continue
    const nodeStart = node.startPosition.row + 1
    const nodeEnd = node.endPosition.row + 1
    if (nodeEnd - nodeStart + 1 > MAX_CHUNK_LINES) {
      // Flush the pending run, then window the oversized node on its own.
      pushSeg(segStart, nodeStart - 1)
      chunks.push(...windowLines(lines.slice(nodeStart - 1, nodeEnd), nodeStart))
      segStart = nodeEnd + 1
      continue
    }
    if (nodeEnd - segStart + 1 >= CHUNK_WINDOW) {
      pushSeg(segStart, nodeEnd)
      segStart = nodeEnd + 1
    }
  }
  pushSeg(segStart, lines.length) // tail

  return chunks
}

async function chunkFile(path: string, content: string): Promise<CodeChunk[]> {
  if (!content.trim()) return []
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const url = GRAMMAR_URLS[ext]
  if (!url) return lineWindowChunks(content)
  try {
    const p = await ensureParser()
    p.setLanguage(await loadLang(ext, url))
    const tree = p.parse(content)
    if (!tree) return lineWindowChunks(content)
    const chunks = astChunks(tree.rootNode, content)
    tree.delete()
    return chunks.length ? chunks : lineWindowChunks(content)
  } catch {
    return lineWindowChunks(content)
  }
}

interface ChunkRequest {
  id: string
  files: { path: string; content: string }[]
}
interface ChunkResult {
  path: string
  chunks: CodeChunk[]
}

self.onmessage = async ({ data }: MessageEvent<ChunkRequest>) => {
  const { id, files } = data
  try {
    const results: ChunkResult[] = []
    for (const f of files) {
      results.push({ path: f.path, chunks: await chunkFile(f.path, f.content) })
    }
    self.postMessage({ id, ok: true, results })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
