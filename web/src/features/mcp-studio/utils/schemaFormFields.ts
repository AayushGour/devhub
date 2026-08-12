// Pure schema→field derivation + array (de)serialization for SchemaForm.
// Split out of the component file so it only exports components (Fast Refresh
// requirement — see react-refresh/only-export-components) and so these are
// independently unit-testable.

import type { JsonSchema, McpPromptArgument } from '@/lib/mcp/types'

export type SchemaFormSource =
  | { kind: 'json-schema'; schema: JsonSchema }
  | { kind: 'prompt-arguments'; arguments: McpPromptArgument[] }

export type FieldControl = 'string' | 'enum' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
export type ArrayItemControl = 'string' | 'number' | 'integer' | 'json'

export interface FieldSpec {
  key: string
  description?: string
  required: boolean
  control: FieldControl
  enumValues?: unknown[]
  arrayItemControl?: ArrayItemControl
}

/** Derive the flat field list to render from either a JSON schema or prompt arguments. */
export function fieldsFromSource(source: SchemaFormSource): FieldSpec[] {
  if (source.kind === 'prompt-arguments') {
    return source.arguments.map((a) => ({
      key: a.name,
      description: a.description,
      required: !!a.required,
      control: 'string',
    }))
  }

  const schema = source.schema ?? {}
  const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {}
  const required = new Set((schema.required as string[] | undefined) ?? [])

  return Object.entries(properties).map(([key, sub]) => {
    const subSchema = sub ?? {}
    const type = subSchema.type as string | undefined
    const enumValues = subSchema.enum as unknown[] | undefined

    let control: FieldControl
    if (enumValues && enumValues.length > 0) control = 'enum'
    else if (type === 'integer') control = 'integer'
    else if (type === 'number') control = 'number'
    else if (type === 'boolean') control = 'boolean'
    else if (type === 'array') control = 'array'
    else if (type === 'object') control = 'object'
    else control = 'string'

    let arrayItemControl: ArrayItemControl | undefined
    if (control === 'array') {
      const itemType = (subSchema.items as JsonSchema | undefined)?.type
      arrayItemControl =
        itemType === 'number' ? 'number' : itemType === 'integer' ? 'integer' : itemType === 'string' ? 'string' : 'json'
    }

    return {
      key,
      description: subSchema.description as string | undefined,
      required: required.has(key),
      control,
      enumValues,
      arrayItemControl,
    }
  })
}

/** Line-based array text (one value per line) → typed array, per item control. */
export function serializeArrayText(text: string, itemControl: ArrayItemControl | undefined): unknown[] {
  const isNumeric = itemControl === 'number' || itemControl === 'integer'
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (isNumeric ? Number(l) : l))
    // Drop unparseable numeric lines rather than emitting NaN (which serializes
    // to `null` on the wire and silently corrupts the argument).
    .filter((v) => !(typeof v === 'number' && Number.isNaN(v)))
}

/** Inverse of `serializeArrayText`, for populating the textarea from an existing value. */
export function arrayValueToText(value: unknown, itemControl: ArrayItemControl | undefined): string {
  if (!Array.isArray(value)) return ''
  if (itemControl === 'json') return JSON.stringify(value, null, 2)
  return value.map((v) => String(v)).join('\n')
}
