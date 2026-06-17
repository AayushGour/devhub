type Token =
  | { type: 'root' }
  | { type: 'key'; name: string }
  | { type: 'index'; n: number }
  | { type: 'wildcard' }
  | { type: 'recursive'; name: string | null }

function tokenize(path: string): Token[] | string {
  const tokens: Token[] = []
  let i = 0

  if (!path.startsWith('$')) return 'Path must start with $'
  tokens.push({ type: 'root' })
  i++

  while (i < path.length) {
    if (path[i] === '.') {
      i++
      if (i >= path.length) return 'Unexpected end after .'

      if (path[i] === '.') {
        i++
        if (path[i] === '*') {
          tokens.push({ type: 'recursive', name: null })
          i++
        } else {
          const start = i
          while (i < path.length && /[\w$]/.test(path[i])) i++
          if (i === start) return 'Expected identifier after ..'
          tokens.push({ type: 'recursive', name: path.slice(start, i) })
        }
      } else if (path[i] === '*') {
        tokens.push({ type: 'wildcard' })
        i++
      } else {
        const start = i
        while (i < path.length && /[\w$]/.test(path[i])) i++
        if (i === start) return `Unexpected character: ${path[i]}`
        tokens.push({ type: 'key', name: path.slice(start, i) })
      }
    } else if (path[i] === '[') {
      i++
      if (path[i] === '*') {
        tokens.push({ type: 'wildcard' })
        i++
        if (path[i] !== ']') return "Expected ']'"
        i++
      } else if (path[i] === '"' || path[i] === "'") {
        const q = path[i]; i++
        const start = i
        while (i < path.length && path[i] !== q) i++
        const name = path.slice(start, i)
        i++ // close quote
        if (path[i] !== ']') return "Expected ']'"
        i++
        tokens.push({ type: 'key', name })
      } else {
        const negative = path[i] === '-'
        if (negative) i++
        const start = i
        while (i < path.length && /\d/.test(path[i])) i++
        if (i === start) return 'Expected number or string inside []'
        const n = parseInt(path.slice(start, i), 10)
        if (path[i] !== ']') return "Expected ']'"
        i++
        tokens.push({ type: 'index', n: negative ? -n : n })
      }
    } else {
      return `Unexpected character: '${path[i]}'`
    }
  }

  return tokens
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function apply(value: unknown, tokens: Token[], idx: number): unknown[] {
  if (idx >= tokens.length) return [value]

  const token = tokens[idx]

  switch (token.type) {
    case 'root':
      return apply(value, tokens, idx + 1)

    case 'key': {
      if (!isObj(value) || !(token.name in value)) return []
      return apply(value[token.name], tokens, idx + 1)
    }

    case 'index': {
      if (!Array.isArray(value)) return []
      const n = token.n < 0 ? value.length + token.n : token.n
      if (n < 0 || n >= value.length) return []
      return apply(value[n], tokens, idx + 1)
    }

    case 'wildcard': {
      if (value === null || typeof value !== 'object') return []
      const children = Array.isArray(value) ? value : Object.values(value)
      return children.flatMap(c => apply(c, tokens, idx + 1))
    }

    case 'recursive': {
      const name = token.name // capture before closure — narrowing is lost inside descend
      const results: unknown[] = []

      function descend(v: unknown) {
        if (v === null || typeof v !== 'object') return

        if (name === null) {
          const children = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
          for (const child of children) {
            results.push(...apply(child, tokens, idx + 1))
            descend(child)
          }
        } else {
          if (isObj(v)) {
            if (name in v) results.push(...apply(v[name], tokens, idx + 1))
            for (const child of Object.values(v)) descend(child)
          } else if (Array.isArray(v)) {
            for (const child of v) descend(child)
          }
        }
      }

      descend(value)
      return results
    }

    default:
      return []
  }
}

export function evaluateJsonPath(root: unknown, path: string): { results: unknown[]; error: string | null } {
  const trimmed = path.trim()
  if (!trimmed) return { results: [], error: 'Empty path' }

  const tokens = tokenize(trimmed)
  if (typeof tokens === 'string') return { results: [], error: tokens }

  try {
    return { results: apply(root, tokens, 0), error: null }
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : String(e) }
  }
}
