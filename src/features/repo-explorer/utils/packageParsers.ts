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
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('http'))
    .map((l) => {
      // Strip extras like package[extra] and markers like package; python_version>='3.8'
      const cleanLine = l.split(';')[0].trim()
      const nameMatch = cleanLine.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)/)
      const versionMatch = cleanLine.match(/[><=~!][^,\s]+(?:,[><=~!][^,\s]+)*/)
      if (!nameMatch) return null
      return {
        name: nameMatch[1],
        version: versionMatch?.[0],
        ecosystem: 'pip' as const,
      }
    })
    .filter((p): p is ExternalPackage => p !== null)
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
  // Find the dependencies array — handle multiline
  const depSection = content.match(/\bdependencies\s*=\s*\[([\s\S]*?)\]/)?.[1]
  if (!depSection) return deps
  // Extract quoted package specifiers
  const re = /["']([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(depSection)) !== null) {
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
