interface TextInputProps {
  value: string
  onChange: (value: string) => void
}

export function TextInput({ value, onChange }: TextInputProps) {
  const charCount = value.length
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste or type text to tokenize…"
        rows={8}
        className="w-full bg-surface-raised border border-border rounded-xl px-4 py-3 text-sm text-on-surface font-mono resize-none outline-none focus:border-accent transition-colors duration-150 placeholder:text-on-surface-muted"
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
