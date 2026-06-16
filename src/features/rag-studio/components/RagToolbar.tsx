import { Trash2 } from 'lucide-react'

interface Props {
  onClearAll: () => void
}

export default function RagToolbar({ onClearAll }: Props) {
  return (
    <div className="h-11 flex items-center px-4 gap-3 shrink-0 border-b border-border bg-surface">
      <span className="text-sm font-semibold text-on-surface tracking-tight">RAG Studio</span>
      <div className="flex-1" />
      <button
        onClick={onClearAll}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border text-xs text-on-surface-muted hover:text-on-surface hover:border-on-surface-muted transition-colors duration-150 cursor-pointer font-[inherit]"
        title="Clear all documents and chat history"
      >
        <Trash2 size={12} />
        Clear all
      </button>
    </div>
  )
}
