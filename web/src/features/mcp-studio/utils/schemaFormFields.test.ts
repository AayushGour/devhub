import { describe, it, expect } from 'vitest'
import { fieldsFromSource, serializeArrayText, arrayValueToText } from './schemaFormFields'

describe('fieldsFromSource — json-schema', () => {
  it('maps a string property to a string control', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: { type: 'object', properties: { name: { type: 'string', description: 'Your name' } } },
    })
    expect(fields).toEqual([{ key: 'name', description: 'Your name', required: false, control: 'string' }])
  })

  it('marks properties listed in `required` as required', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    })
    expect(fields[0].required).toBe(true)
  })

  it('prefers an enum control when `enum` is present, regardless of type', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: { type: 'object', properties: { mode: { type: 'string', enum: ['a', 'b'] } } },
    })
    expect(fields[0].control).toBe('enum')
    expect(fields[0].enumValues).toEqual(['a', 'b'])
  })

  it('maps number, integer, boolean, array, object types to their own controls', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: {
        type: 'object',
        properties: {
          n: { type: 'number' },
          i: { type: 'integer' },
          b: { type: 'boolean' },
          arr: { type: 'array', items: { type: 'string' } },
          obj: { type: 'object' },
        },
      },
    })
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))
    expect(byKey.n.control).toBe('number')
    expect(byKey.i.control).toBe('integer')
    expect(byKey.b.control).toBe('boolean')
    expect(byKey.arr.control).toBe('array')
    expect(byKey.arr.arrayItemControl).toBe('string')
    expect(byKey.obj.control).toBe('object')
  })

  it('falls back to a json array-item control for non-primitive array items', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: { type: 'object', properties: { arr: { type: 'array', items: { type: 'object' } } } },
    })
    expect(fields[0].arrayItemControl).toBe('json')
  })

  it('defaults an untyped property to a string control', () => {
    const fields = fieldsFromSource({
      kind: 'json-schema',
      schema: { type: 'object', properties: { anything: {} } },
    })
    expect(fields[0].control).toBe('string')
  })
})

describe('fieldsFromSource — prompt-arguments', () => {
  it('maps every prompt argument to a required-aware string control', () => {
    const fields = fieldsFromSource({
      kind: 'prompt-arguments',
      arguments: [
        { name: 'topic', description: 'Topic to summarize', required: true },
        { name: 'tone' },
      ],
    })
    expect(fields).toEqual([
      { key: 'topic', description: 'Topic to summarize', required: true, control: 'string' },
      { key: 'tone', description: undefined, required: false, control: 'string' },
    ])
  })
})

describe('serializeArrayText / arrayValueToText', () => {
  it('splits one-value-per-line text into a string array', () => {
    expect(serializeArrayText('a\nb\n\nc', 'string')).toEqual(['a', 'b', 'c'])
  })

  it('coerces numeric item controls', () => {
    expect(serializeArrayText('1\n2\n3', 'number')).toEqual([1, 2, 3])
    expect(serializeArrayText('1\n2', 'integer')).toEqual([1, 2])
  })

  it('drops unparseable numeric lines instead of emitting NaN', () => {
    expect(serializeArrayText('1\nabc\n3', 'number')).toEqual([1, 3])
    expect(serializeArrayText('x\ny', 'integer')).toEqual([])
    // Non-numeric controls keep every non-empty line verbatim.
    expect(serializeArrayText('1\nabc', 'string')).toEqual(['1', 'abc'])
  })

  it('round-trips a string array through arrayValueToText', () => {
    const text = arrayValueToText(['a', 'b'], 'string')
    expect(text).toBe('a\nb')
    expect(serializeArrayText(text, 'string')).toEqual(['a', 'b'])
  })

  it('renders a json-mode array as pretty JSON', () => {
    expect(arrayValueToText([{ a: 1 }], 'json')).toBe(JSON.stringify([{ a: 1 }], null, 2))
  })

  it('returns an empty string for a non-array value', () => {
    expect(arrayValueToText(undefined, 'string')).toBe('')
    expect(arrayValueToText('not an array', 'string')).toBe('')
  })
})
