import { Bot, Plus } from 'lucide-react'
import { CURATED_MODELS } from '@/lib/llm/models'

interface Props {
  modelId: string
  onModelChange: (id: string) => void
  onNewRun: () => void
  isRunning: boolean
}

const SELECT_CLS = 'bg-surface-raised border border-border rounded-lg px-2 py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer focus:border-accent transition-colors duration-150'

const toolModels = CURATED_MODELS.filter((m) => m.supportsTools)

export default function AgentToolbar({ modelId, onModelChange, onNewRun, isRunning }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface shrink-0">
      <Bot size={16} className="text-accent shrink-0" />
      <span className="text-xs font-medium text-on-surface">Agent Workspace</span>

      <div className="flex-1" />

      <label className="text-xs text-on-surface-muted">Model</label>
      <select
        className={SELECT_CLS}
        value={modelId}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={isRunning}
      >
        {toolModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <button
        onClick={onNewRun}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 bg-accent text-accent-text hover:bg-accent-hover"
      >
        <Plus size={12} />
        New run
      </button>
    </div>
  )
}
