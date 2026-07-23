// JSON-Schema → input form. Shared by ToolsPanel (tool `inputSchema`) and
// PromptsPanel (prompt `arguments`, which are always plain named strings — no
// schema). Renders one control per top-level property: string / number /
// integer / boolean / enum / array / object, with required markers, and
// reports back a typed args object via `onChange`.
//
// Field derivation + array (de)serialization live in
// `../utils/schemaFormFields` (pure, unit-tested, and kept out of this file so
// it only exports the component — see react-refresh/only-export-components).

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { fieldsFromSource, serializeArrayText, arrayValueToText } from '../utils/schemaFormFields'
import type { SchemaFormSource } from '../utils/schemaFormFields'

export type { SchemaFormSource }

export interface SchemaFormProps {
  source: SchemaFormSource
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
  className?: string
}

const FIELD_INPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-2.5 py-1.5 text-xs text-on-surface outline-none font-[inherit] focus:border-accent transition-colors duration-150'
const FIELD_LABEL_CLS = 'text-[0.65rem] text-on-surface-muted'

export default function SchemaForm({ source, value, onChange, disabled, className }: SchemaFormProps) {
  const fields = fieldsFromSource(source)
  const [rawJson, setRawJson] = useState<Record<string, string>>({})
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({})
  // Raw text the user is typing for number and array fields. The committed
  // `value` holds the parsed form, but numbers mid-entry ("0.", "-") and array
  // newlines can't survive a round-trip through the parsed value, so we render
  // from this cache while it exists. Reset per selection by the parent's `key`.
  const [rawInput, setRawInput] = useState<Record<string, string>>({})

  function set(key: string, v: unknown) {
    onChange({ ...value, [key]: v })
  }

  function setJsonField(key: string, text: string, wrapAsArray: boolean) {
    setRawJson((prev) => ({ ...prev, [key]: text }))
    if (text.trim() === '') {
      setJsonErrors((prev) => ({ ...prev, [key]: '' }))
      set(key, undefined)
      return
    }
    try {
      const parsed = JSON.parse(text)
      setJsonErrors((prev) => ({ ...prev, [key]: '' }))
      set(key, wrapAsArray && !Array.isArray(parsed) ? [parsed] : parsed)
    } catch {
      setJsonErrors((prev) => ({ ...prev, [key]: 'Invalid JSON' }))
    }
  }

  if (fields.length === 0) {
    return <p className={cn('text-[0.65rem] text-on-surface-muted italic', className)}>No parameters.</p>
  }

  return (
    <div className={cn('space-y-3', className)}>
      {fields.map((f) => {
        const isJsonField = f.control === 'object' || (f.control === 'array' && f.arrayItemControl === 'json')

        return (
          <div key={f.key}>
            <label className={FIELD_LABEL_CLS}>
              {f.key}
              {f.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {f.description && <p className="text-[0.6rem] text-on-surface-muted/70 mb-1">{f.description}</p>}

            {f.control === 'string' && (
              <input
                type="text"
                disabled={disabled}
                value={(value[f.key] as string) ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                className={cn(FIELD_INPUT_CLS, 'mt-0.5')}
              />
            )}

            {(f.control === 'number' || f.control === 'integer') && (
              // type="text" (not type="number"): a number input reports "" for
              // intermediate values like "0." or "-", which would blank the field
              // and make decimals/negatives impossible to type. We keep the raw
              // string and parse it ourselves.
              <input
                type="text"
                inputMode={f.control === 'integer' ? 'numeric' : 'decimal'}
                disabled={disabled}
                value={rawInput[f.key] ?? (value[f.key] === undefined ? '' : String(value[f.key]))}
                onChange={(e) => {
                  const raw = e.target.value
                  setRawInput((prev) => ({ ...prev, [f.key]: raw }))
                  const trimmed = raw.trim()
                  const num = Number(trimmed)
                  if (trimmed === '' || Number.isNaN(num)) {
                    set(f.key, undefined)
                    return
                  }
                  set(f.key, f.control === 'integer' ? Math.trunc(num) : num)
                }}
                className={cn(FIELD_INPUT_CLS, 'mt-0.5')}
              />
            )}

            {f.control === 'boolean' && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => set(f.key, !value[f.key])}
                className={cn(
                  'mt-0.5 flex items-center w-8 h-[1.1rem] rounded-full shrink-0 px-[0.15rem] transition-colors duration-150',
                  value[f.key] ? 'bg-accent justify-end' : 'bg-border justify-start',
                )}
              >
                <span className="w-[0.8rem] h-[0.8rem] rounded-full bg-white transition-all duration-150" />
              </button>
            )}

            {f.control === 'enum' && (
              <select
                disabled={disabled}
                value={value[f.key] !== undefined ? String(value[f.key]) : ''}
                onChange={(e) => {
                  // Options are keyed by String(opt); map the picked string back to
                  // the original enum value so numeric/boolean enums keep their type.
                  const picked = f.enumValues?.find((opt) => String(opt) === e.target.value)
                  set(f.key, picked ?? e.target.value)
                }}
                className={cn(FIELD_INPUT_CLS, 'mt-0.5 cursor-pointer')}
              >
                <option value="" disabled>Select…</option>
                {f.enumValues?.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                ))}
              </select>
            )}

            {f.control === 'array' && !isJsonField && (
              // Render from rawInput so blank lines the user just typed aren't
              // stripped on every keystroke (which would snap the cursor back to
              // line 1 and prevent entering a second item). The committed value is
              // still the parsed, empties-dropped array.
              <textarea
                disabled={disabled}
                rows={3}
                value={rawInput[f.key] ?? arrayValueToText(value[f.key], f.arrayItemControl)}
                onChange={(e) => {
                  setRawInput((prev) => ({ ...prev, [f.key]: e.target.value }))
                  set(f.key, serializeArrayText(e.target.value, f.arrayItemControl))
                }}
                placeholder="One value per line"
                className={cn(FIELD_INPUT_CLS, 'mt-0.5 font-mono resize-none')}
              />
            )}

            {isJsonField && (
              <>
                <textarea
                  disabled={disabled}
                  rows={f.control === 'object' ? 4 : 3}
                  value={rawJson[f.key] ?? (value[f.key] !== undefined ? JSON.stringify(value[f.key], null, 2) : '')}
                  onChange={(e) => setJsonField(f.key, e.target.value, f.control === 'array')}
                  placeholder={f.control === 'object' ? '{ }' : '[ ]'}
                  className={cn(FIELD_INPUT_CLS, 'mt-0.5 font-mono resize-none')}
                />
                {jsonErrors[f.key] && <p className="text-[0.6rem] text-red-400 mt-0.5">{jsonErrors[f.key]}</p>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
