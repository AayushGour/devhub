function mergeSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  if (schemas.length === 0) return {}
  const types = [...new Set(schemas.map(s => s.type as string))]
  if (types.length === 1) return schemas[0]
  const objectSchema = schemas.find(s => s.type === 'object')
  if (objectSchema) return objectSchema
  return { oneOf: schemas }
}

function generateSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'string') return { type: 'string' }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', items: {} }
    return { type: 'array', items: mergeSchemas(value.map(generateSchema)) }
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [k, v] of Object.entries(obj)) {
      properties[k] = generateSchema(v)
      if (v !== null && v !== undefined) required.push(k)
    }

    return { type: 'object', properties, ...(required.length ? { required } : {}) }
  }

  return {}
}

export function buildSchema(value: unknown): string {
  return JSON.stringify(
    { $schema: 'http://json-schema.org/draft-07/schema#', ...generateSchema(value) },
    null,
    2
  )
}
