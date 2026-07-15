import { useState } from 'react'
import type { ToolDefinition } from '@/lib/llm/engine'
import { callTool } from '../mcp/mcpClient'
import { useMcpStore } from '../mcp/mcpStore'
import { executeFetchUrl } from '../tools/fetchUrl'
import { executeWebSearch } from '../tools/webSearch'
import { executeRunJavaScript } from '../tools/runJavaScript'
import { executeRunPython } from '../tools/runPython'
import { executeFileSystem } from '../tools/fileSystem'
import { executeMemory } from '../tools/memory'
import {
  FETCH_URL_SCHEMA,
  WEB_SEARCH_SCHEMA,
  RUN_JAVASCRIPT_SCHEMA,
  RUN_PYTHON_SCHEMA,
  FILE_SYSTEM_SCHEMA,
  MEMORY_SCHEMA,
} from '../utils/toolSchemas'

interface BuiltInTool {
  schema: ToolDefinition
  execute: (args: Record<string, unknown>) => Promise<string>
  defaultEnabled: boolean
  setupNote?: string
}

const BUILT_IN_TOOLS: BuiltInTool[] = [
  { schema: FETCH_URL_SCHEMA, execute: executeFetchUrl, defaultEnabled: true },
  { schema: WEB_SEARCH_SCHEMA, execute: executeWebSearch, defaultEnabled: true },
  { schema: RUN_JAVASCRIPT_SCHEMA, execute: executeRunJavaScript, defaultEnabled: true },
  { schema: MEMORY_SCHEMA, execute: executeMemory, defaultEnabled: true },
  {
    schema: RUN_PYTHON_SCHEMA,
    execute: executeRunPython,
    defaultEnabled: false,
    setupNote: 'Loads ~8MB on first use.',
  },
  {
    schema: FILE_SYSTEM_SCHEMA,
    execute: executeFileSystem,
    defaultEnabled: false,
    setupNote: 'Chrome/Edge only. User will be prompted to select a directory.',
  },
]

const DEFAULT_ENABLED = new Set(
  BUILT_IN_TOOLS.filter((t) => t.defaultEnabled).map((t) => t.schema.function.name),
)

export function useAgentTools() {
  const [enabledBuiltIns, setEnabledBuiltIns] = useState<Set<string>>(DEFAULT_ENABLED)
  const servers = useMcpStore((s) => s.servers)

  function toggleBuiltIn(name: string) {
    setEnabledBuiltIns((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const builtInEntries = BUILT_IN_TOOLS.filter((t) => enabledBuiltIns.has(t.schema.function.name))

  const mcpEntries = servers
    .filter((s) => s.status === 'connected')
    .flatMap((s) =>
      s.tools.map((t) => ({
        schema: t,
        execute: (args: Record<string, unknown>) => callTool(s.session!, t.function.name, args),
        source: s.name,
      })),
    )

  const allTools = [...builtInEntries, ...mcpEntries]
  const allToolSchemas: ToolDefinition[] = allTools.map((t) => t.schema)

  async function executeTool(name: string, argsJson: string): Promise<string> {
    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsJson)
    } catch {
      return '[ERROR] Invalid JSON arguments'
    }
    // Hermes-2-Pro occasionally wraps the real tool call in a FunctionCall envelope:
    //   tool name = "FunctionCall", args = { "name": "run_javascript", "code": "..." }
    // Unwrap silently so the real tool is invoked without the spurious error step.
    let resolvedName = name
    if (name === 'FunctionCall' && typeof args.name === 'string') {
      resolvedName = args.name
      const { name: _n, ...rest } = args
      args = rest
    }
    const tool = allTools.find((t) => t.schema.function.name === resolvedName)
    if (!tool) return `[ERROR] Unknown tool: ${resolvedName}`
    try {
      return await tool.execute(args)
    } catch (err) {
      return `[ERROR] ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    allTools,
    allToolSchemas,
    builtInTools: BUILT_IN_TOOLS,
    enabledBuiltIns,
    toggleBuiltIn,
    executeTool,
  }
}
