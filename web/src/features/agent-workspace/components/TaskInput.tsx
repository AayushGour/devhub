import { Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  task: string
  onTaskChange: (v: string) => void
  onRun: (task: string) => void
  onStop: () => void
  isRunning: boolean
}

export default function TaskInput({ task, onTaskChange, onRun, onStop, isRunning }: Props) {
  function handleRun() {
    const trimmed = task.trim()
    if (!trimmed || isRunning) return
    onRun(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleRun()
    }
  }

  return (
    <div className="p-3 border-t border-border bg-surface">
      <textarea
        value={task}
        onChange={(e) => onTaskChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe a task for the agent…"
        rows={3}
        disabled={isRunning}
        className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-muted outline-none resize-none font-[inherit] focus:border-accent transition-colors duration-150 disabled:opacity-50"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[0.65rem] text-on-surface-muted">⌘↵ to run</span>
        {isRunning ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors duration-150"
          >
            <Square size={11} />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!task.trim()}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150',
              task.trim()
                ? 'bg-accent text-accent-text hover:bg-accent-hover'
                : 'bg-surface-raised text-on-surface-muted cursor-not-allowed',
            )}
          >
            <Play size={11} />
            Run
          </button>
        )}
      </div>
    </div>
  )
}
