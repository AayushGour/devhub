import { useState } from 'react'
import { CURATED_MODELS } from '@/lib/llm/models'
import { useAgentStore } from '../utils/agentStore'
import { useAgentTools } from '../hooks/useAgentTools'
import { useAgentRunner } from '../hooks/useAgentRunner'
import AgentToolbar from './AgentToolbar'
import TaskInput from './TaskInput'
import RunInspector from './RunInspector'
import ToolManager from './ToolManager'

const toolModels = CURATED_MODELS.filter((m) => m.supportsTools)
const DEFAULT_MODEL = toolModels[0]?.id ?? ''

export default function AgentWorkspacePage() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL)

  const activeId = useAgentStore((s) => s.activeSessionId)
  const session = useAgentStore((s) => s.sessions.find((sess) => sess.id === activeId))
  const isRunning = session?.status === 'running'

  const { allToolSchemas, builtInTools, enabledBuiltIns, toggleBuiltIn, executeTool } = useAgentTools()
  const { run, stop } = useAgentRunner(modelId, allToolSchemas, executeTool)

  function handleNewRun() {
    useAgentStore.setState({ activeSessionId: null })
  }

  return (
    <div className="studio-root">
      <AgentToolbar modelId={modelId} onModelChange={setModelId} onNewRun={handleNewRun} />
      <div className="flex flex-1 min-h-0">
        <aside className="w-72 shrink-0 border-r border-border overflow-y-auto flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <ToolManager
              builtInTools={builtInTools}
              enabledBuiltIns={enabledBuiltIns}
              onToggle={toggleBuiltIn}
            />
          </div>
          <TaskInput onRun={run} onStop={stop} isRunning={isRunning} />
        </aside>
        <RunInspector />
      </div>
    </div>
  )
}
