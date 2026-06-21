import { useRef } from 'react'
import { get_encoding } from 'tiktoken'
import { callWithTools, complete, type AgentMessage, type ToolDefinition } from '@/lib/llm/engine'
import { getModelById } from '@/lib/llm/models'
import { useAgentStore, type AgentStep } from '../utils/agentStore'

const enc = get_encoding('cl100k_base')

function countTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    return sum + enc.encode(text).length + 4
  }, 0)
}

async function compactMessages(
  messages: AgentMessage[],
  modelId: string,
): Promise<AgentMessage[]> {
  const system = messages[0]
  const recent = messages.slice(-4)
  const middle = messages.slice(1, -4)
  if (middle.length === 0) return messages

  const raw = middle
    .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')}`)
    .join('\n\n')

  const summary = await complete(
    modelId,
    [
      {
        role: 'user',
        content: `Summarize these agent steps (max 200 words). Keep: facts found, errors hit, what's still needed.\n\n${raw}`,
      },
    ],
    { max_tokens: 256 },
  )

  return [
    system,
    { role: 'user', content: `[Earlier steps compressed]\n${summary}` } as AgentMessage,
    ...recent,
  ]
}

function buildSystemPrompt(tools: ToolDefinition[]): string {
  const toolList = tools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join('\n')

  return `You are an autonomous AI agent. Available tools:\n${toolList}\n\nThink step by step. Use tools to gather information. Give your final answer when done.\nIf a tool errors, try a different approach. Do not repeat failed tool calls.`
}

function makeStep(type: AgentStep['type'], content: string, extra?: Partial<AgentStep>): AgentStep {
  return { id: crypto.randomUUID(), type, content, timestamp: Date.now(), ...extra }
}

export function useAgentRunner(
  modelId: string,
  allToolSchemas: ToolDefinition[],
  executeTool: (name: string, argsJson: string) => Promise<string>,
) {
  const abortRef = useRef(false)
  const { createSession, appendStep, setStatus } = useAgentStore()

  async function run(task: string) {
    abortRef.current = false

    const enabledTools = allToolSchemas.map((t) => t.function.name)
    const sessionId = createSession(task, modelId, enabledTools)

    const modelEntry = getModelById(modelId)
    const contextWindow = modelEntry?.contextWindow ?? 4096
    const threshold = contextWindow * 0.6

    let messages: AgentMessage[] = [
      { role: 'system', content: buildSystemPrompt(allToolSchemas) },
      { role: 'user', content: task },
    ]

    const MAX_ITER = 12
    let i = 0
    for (; i < MAX_ITER; i++) {
      if (abortRef.current) {
        setStatus(sessionId, 'stopped')
        break
      }

      if (countTokens(messages) > threshold) {
        messages = await compactMessages(messages, modelId)
        appendStep(sessionId, makeStep('compact', 'earlier context summarised'))
      }

      let resp
      try {
        resp = await callWithTools(modelId, messages, allToolSchemas, { max_tokens: 1024 })
      } catch (err) {
        appendStep(sessionId, makeStep('error', `LLM error: ${err instanceof Error ? err.message : String(err)}`))
        setStatus(sessionId, 'error')
        return
      }

      if (resp.tool_calls && resp.tool_calls.length > 0) {
        // push assistant turn with tool_calls into history
        messages.push({ role: 'assistant', content: resp.content ?? '' } as AgentMessage)

        for (const tc of resp.tool_calls) {
          const toolName = tc.function.name
          let parsedArgs: Record<string, unknown> = {}
          try { parsedArgs = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

          appendStep(sessionId, makeStep('call', tc.function.arguments, { toolName, args: parsedArgs }))

          const result = await executeTool(toolName, tc.function.arguments)
          appendStep(sessionId, makeStep('observe', result))

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.slice(0, 1500),
          })
        }
      } else {
        appendStep(sessionId, makeStep('done', resp.content ?? ''))
        setStatus(sessionId, 'done')
        return
      }
    }

    if (i === MAX_ITER) {
      appendStep(sessionId, makeStep('error', 'Max iterations reached'))
      setStatus(sessionId, 'error')
    }
  }

  async function stop() {
    abortRef.current = true
    // Interrupt in-flight inference if engine is available
    try {
      const { getEngine } = await import('@/lib/llm/engine')
      const engine = await getEngine(modelId)
      engine.interruptGenerate()
    } catch { /* engine may not be loaded */ }
  }

  return { run, stop }
}
