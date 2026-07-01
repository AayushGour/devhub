import { useState } from 'react'
import { CURATED_MODELS } from '@/lib/llm/models'
import { useAgentStore } from '../utils/agentStore'
import { useAgentTools } from '../hooks/useAgentTools'
import { useAgentRunner } from '../hooks/useAgentRunner'
import AgentToolbar from './AgentToolbar'
import TaskInput from './TaskInput'
import RunInspector from './RunInspector'
import ToolManager from './ToolManager'
import RunHistory from './RunHistory'

const toolModels = CURATED_MODELS.filter((m) => m.supportsTools)
const DEFAULT_MODEL =
  toolModels.find((m) => m.id === 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC')?.id ??
  toolModels[0]?.id ??
  ''

export default function AgentWorkspacePage() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL)
  const [task, setTask] = useState('')

  const activeId = useAgentStore((s) => s.activeSessionId)
  const session = useAgentStore((s) => s.sessions.find((sess) => sess.id === activeId))
  const setActiveSession = useAgentStore((s) => s.setActiveSession)
  const isRunning = session?.status === 'running'

  const { allToolSchemas, builtInTools, enabledBuiltIns, toggleBuiltIn, executeTool } = useAgentTools()
  const { run, stop, abort } = useAgentRunner(modelId, allToolSchemas, executeTool)

  // The shared GPU engine self-unloads after an idle period (see lib/llm/engine).
  // We deliberately do NOT unload on unmount: it is shared with RAG / repo-explorer
  // and a background job there can outlive this page.

  // "New run" clears the composer and deselects the active session so the
  // inspector shows its empty state — prior runs stay in History (they are no
  // longer wiped). abort() supersedes any in-flight run.
  function handleNewRun() {
    abort()
    setActiveSession(null)
    setTask('')
  }

  return (
    <div className="studio-root">
      <AgentToolbar modelId={modelId} onModelChange={setModelId} onNewRun={handleNewRun} isRunning={isRunning} />
      <div className="flex flex-1 min-h-0">
        <aside className="w-72 shrink-0 border-r border-border overflow-y-auto flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <ToolManager
              builtInTools={builtInTools}
              enabledBuiltIns={enabledBuiltIns}
              onToggle={toggleBuiltIn}
            />
            <div className="px-3 pb-3">
              <RunHistory />
            </div>
          </div>
          <TaskInput task={task} onTaskChange={setTask} onRun={run} onStop={stop} isRunning={isRunning} />
        </aside>
        <RunInspector />
      </div>
    </div>
  )
}
