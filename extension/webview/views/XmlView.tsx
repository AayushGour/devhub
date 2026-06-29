import { useMemo } from 'react'
import DataView from './DataView'

function elementToJson(el: Element): unknown {
  const attrs = Object.fromEntries(
    Array.from(el.attributes).map((a) => [`@${a.name}`, a.value]),
  )
  const children = Array.from(el.children)

  if (children.length === 0) {
    const text = el.textContent?.trim() ?? ''
    if (Object.keys(attrs).length === 0) return text || null
    return { ...attrs, ...(text ? { '#text': text } : {}) }
  }

  const obj: Record<string, unknown> = { ...attrs }
  for (const child of children) {
    const key = child.tagName
    const val = elementToJson(child)
    if (key in obj) {
      const existing = obj[key]
      obj[key] = Array.isArray(existing) ? [...existing, val] : [existing, val]
    } else {
      obj[key] = val
    }
  }
  return obj
}

function xmlToJson(xmlStr: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlStr, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(err.textContent ?? 'Invalid XML')
  return JSON.stringify({ [doc.documentElement.tagName]: elementToJson(doc.documentElement) }, null, 2)
}

export default function XmlView({ text }: { text: string }) {
  const { json, error } = useMemo(() => {
    if (!text.trim()) return { json: '', error: undefined }
    try {
      return { json: xmlToJson(text), error: undefined }
    } catch (e) {
      return { json: '', error: (e as Error).message }
    }
  }, [text])

  return <DataView input={json} error={error} />
}
