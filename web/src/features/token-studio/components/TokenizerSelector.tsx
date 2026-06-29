import { TOKENIZER_DEFS } from '../utils/tokenizers'
import { cn } from '@/lib/utils'

const SELECT_CLS =
  'bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-sm text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'

interface TokenizerSelectorProps {
  value: string
  onChange: (id: string) => void
  label?: string
  className?: string
}

const gptDefs = TOKENIZER_DEFS.filter((d) => d.family === 'gpt')
const localDefs = TOKENIZER_DEFS.filter((d) => d.family === 'local')

export function TokenizerSelector({ value, onChange, label, className }: TokenizerSelectorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <span className="text-xs text-on-surface-muted font-medium">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLS}
      >
        <optgroup label="OpenAI / GPT">
          {gptDefs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {d.description}
            </option>
          ))}
        </optgroup>
        <optgroup label="Local Models">
          {localDefs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {d.description}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  )
}
