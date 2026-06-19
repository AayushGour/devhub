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
