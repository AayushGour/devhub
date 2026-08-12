import { TextAreaField } from '@/components/ui/TextAreaField'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export function TextInput({ value, onChange }: TextInputProps) {
  const charCount = value.length
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div className="flex flex-col gap-1.5">
      <TextAreaField
        value={value}
        onChange={onChange}
        placeholder="Paste or type text to tokenize…"
        rows={8}
        spellCheck={false}
      />
      <div className="flex gap-3 text-xs text-on-surface-muted px-1">
        <span>{charCount.toLocaleString()} chars</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} words</span>
      </div>
    </div>
  )
}
