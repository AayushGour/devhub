import { cn } from '@/lib/utils'

const TEXTAREA_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-accent transition-colors duration-150 resize-none font-mono'

interface TextAreaFieldProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  rows?: number
  placeholder?: string
  spellCheck?: boolean
  className?: string
}

export function TextAreaField({
  value,
  onChange,
  readOnly,
  rows,
  placeholder,
  spellCheck,
  className,
}: TextAreaFieldProps) {
  return (
    <textarea
      className={cn(TEXTAREA_CLS, readOnly && 'cursor-default', className)}
      value={value}
      onChange={onChange ? e => onChange(e.target.value) : undefined}
      readOnly={readOnly}
      rows={rows}
      placeholder={placeholder}
      spellCheck={spellCheck}
    />
  )
}
