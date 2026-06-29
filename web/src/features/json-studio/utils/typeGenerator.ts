export type TypeLang = 'typescript' | 'go' | 'rust' | 'java' | 'csharp'

interface FieldDef {
  key: string
  type: string
}

interface TypeDef {
  name: string
  fields: FieldDef[]
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase())
    || 'Root'
}

function toSnakeCase(str: string): string {
  return str
    .replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
    .replace(/^_/, '')
}

function boxJava(t: string): string {
  return { int: 'Integer', double: 'Double', boolean: 'Boolean' }[t] ?? t
}

function inferType(
  value: unknown,
  name: string,
  lang: TypeLang,
  types: Map<string, TypeDef>
): string {
  if (value === null) {
    return { typescript: 'null', go: 'interface{}', rust: 'Option<serde_json::Value>', java: 'Object', csharp: 'object' }[lang]
  }
  if (typeof value === 'boolean') {
    return { typescript: 'boolean', go: 'bool', rust: 'bool', java: 'boolean', csharp: 'bool' }[lang]
  }
  if (typeof value === 'number') {
    const isInt = Number.isInteger(value)
    return {
      typescript: 'number',
      go: isInt ? 'int' : 'float64',
      rust: isInt ? 'i64' : 'f64',
      java: isInt ? 'int' : 'double',
      csharp: isInt ? 'int' : 'double',
    }[lang]
  }
  if (typeof value === 'string') {
    return { typescript: 'string', go: 'string', rust: 'String', java: 'String', csharp: 'string' }[lang]
  }
  if (Array.isArray(value)) {
    const fallback = { typescript: 'unknown', go: 'interface{}', rust: 'serde_json::Value', java: 'Object', csharp: 'object' }[lang]
    const elem = value.length > 0 ? inferType(value[0], `${name}Item`, lang, types) : fallback
    return {
      typescript: `${elem}[]`,
      go: `[]${elem}`,
      rust: `Vec<${elem}>`,
      java: `List<${boxJava(elem)}>`,
      csharp: `List<${elem}>`,
    }[lang]
  }
  if (typeof value === 'object') {
    const typeName = toPascalCase(name)
    collectType(value as Record<string, unknown>, typeName, lang, types)
    return typeName
  }
  return { typescript: 'unknown', go: 'interface{}', rust: 'serde_json::Value', java: 'Object', csharp: 'object' }[lang]
}

function collectType(
  obj: Record<string, unknown>,
  name: string,
  lang: TypeLang,
  types: Map<string, TypeDef>
) {
  if (types.has(name)) return
  // Reserve slot to prevent infinite recursion on circular shapes
  types.set(name, { name, fields: [] })

  const fields: FieldDef[] = Object.entries(obj).map(([key, val]) => ({
    key,
    type: inferType(val, toPascalCase(key), lang, types),
  }))

  types.set(name, { name, fields })
}

function renderTypeScript(types: Map<string, TypeDef>): string {
  return [...types.values()].reverse().map(({ name, fields }) => {
    const body = fields.map(f => `  ${f.key}: ${f.type};`).join('\n')
    return `interface ${name} {\n${body}\n}`
  }).join('\n\n')
}

function renderGo(types: Map<string, TypeDef>): string {
  return [...types.values()].reverse().map(({ name, fields }) => {
    const body = fields.map(f => {
      const goName = toPascalCase(f.key)
      return `\t${goName} ${f.type} \`json:"${f.key}"\``
    }).join('\n')
    return `type ${name} struct {\n${body}\n}`
  }).join('\n\n')
}

function renderRust(types: Map<string, TypeDef>): string {
  return [...types.values()].reverse().map(({ name, fields }) => {
    const body = fields.map(f => {
      const snakeKey = toSnakeCase(f.key)
      const rename = snakeKey !== f.key ? `    #[serde(rename = "${f.key}")]\n` : ''
      return `${rename}    pub ${snakeKey}: ${f.type},`
    }).join('\n')
    return `#[derive(Debug, Serialize, Deserialize)]\npub struct ${name} {\n${body}\n}`
  }).join('\n\n')
}

function renderJava(types: Map<string, TypeDef>): string {
  return [...types.values()].reverse().map(({ name, fields }) => {
    const body = fields.map(f => `    public ${f.type} ${f.key};`).join('\n')
    return `public class ${name} {\n${body}\n}`
  }).join('\n\n')
}

function renderCSharp(types: Map<string, TypeDef>): string {
  return [...types.values()].reverse().map(({ name, fields }) => {
    const body = fields.map(f => {
      const propName = toPascalCase(f.key)
      return `    public ${f.type} ${propName} { get; set; }`
    }).join('\n')
    return `public class ${name} {\n${body}\n}`
  }).join('\n\n')
}

export function generateTypes(value: unknown, rootName: string, lang: TypeLang): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `// Root value must be a JSON object to generate types`
  }

  const types = new Map<string, TypeDef>()
  collectType(value as Record<string, unknown>, toPascalCase(rootName || 'Root'), lang, types)

  switch (lang) {
    case 'typescript': return renderTypeScript(types)
    case 'go': return renderGo(types)
    case 'rust': return renderRust(types)
    case 'java': return renderJava(types)
    case 'csharp': return renderCSharp(types)
  }
}
