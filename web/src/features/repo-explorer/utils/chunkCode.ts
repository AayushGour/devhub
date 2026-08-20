// Shared chunk shape + a language-agnostic line-window chunker. The tree-sitter
// worker produces the same `CodeChunk` shape from AST boundaries and falls back
// to this windowing for unsupported languages, parse failures, or oversized nodes.

export interface CodeChunk {
  startLine: number // 1-based
  endLine: number   // 1-based, inclusive
  text: string
}

export const CHUNK_WINDOW = 40
export const CHUNK_OVERLAP = 8

// Window an array of source lines into overlapping chunks. `baseLine` is the
// 1-based line number that `lines[0]` occupies in the original file.
export function windowLines(lines: string[], baseLine = 1): CodeChunk[] {
  const chunks: CodeChunk[] = []
  const stride = CHUNK_WINDOW - CHUNK_OVERLAP
  for (let start = 0; start < lines.length; start += stride) {
    const end = Math.min(start + CHUNK_WINDOW, lines.length)
    const text = lines.slice(start, end).join('\n')
    if (text.trim()) {
      chunks.push({ startLine: baseLine + start, endLine: baseLine + end - 1, text })
    }
    if (end >= lines.length) break
  }
  return chunks
}

// Full-file fallback chunker (no AST).
export function lineWindowChunks(content: string): CodeChunk[] {
  return windowLines(content.split('\n'), 1)
}
