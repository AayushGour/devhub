import { useRef } from 'react'
import { callWithTools, complete, type AgentMessage, type ToolDefinition } from '@/lib/llm/engine'
// complete is used only for context compaction summaries
import { getModelById } from '@/lib/llm/models'
import { useAgentStore, type AgentStep } from '../utils/agentStore'

const log = (...args: unknown[]) => console.log('[agent]', ...args)

// ~4 chars per token is a standard approximation for BPE tokenizers
function countTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    return sum + Math.ceil(text.length / 4) + 4
  }, 0)
}

async function compactMessages(
  messages: AgentMessage[],
  modelId: string,
): Promise<AgentMessage[]> {
  // messages[0] is always the original task (user) — preserve it
  const taskMsg = messages[0]
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
    taskMsg,
    { role: 'user', content: `[Earlier steps compressed]\n${summary}` } as AgentMessage,
    ...recent,
  ]
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
    log('session started', { sessionId, modelId, tools: enabledTools, task })

    const modelEntry = getModelById(modelId)
    const contextWindow = modelEntry?.contextWindow ?? 4096
    const threshold = contextWindow * 0.6

    // Hermes-2-Pro (and likely other web-llm tool models) forbid custom system
    // prompts when tools are present. Start with just the user task.
    let messages: AgentMessage[] = [
      { role: 'user', content: task },
    ]

    const MAX_ITER = 12
    let i = 0
    for (; i < MAX_ITER; i++) {
      log(`iteration ${i + 1}/${MAX_ITER}, messages:`, messages.length)

      if (abortRef.current) {
        log('aborted by user')
        setStatus(sessionId, 'stopped')
        break
      }

      if (countTokens(messages) > threshold) {
        log('compacting context, token estimate exceeded threshold', threshold)
        messages = await compactMessages(messages, modelId)
        appendStep(sessionId, makeStep('compact', 'earlier context summarised'))
      }

      let resp
      try {
        log('calling LLM...')
        resp = await callWithTools(modelId, messages, allToolSchemas, { max_tokens: 1024, resetFirst: i === 0 })
        log('LLM response', { finish_reason: resp.finish_reason, tool_calls: resp.tool_calls?.length ?? 0, content_len: resp.content?.length ?? 0 })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[agent] LLM call failed:', err)
        appendStep(sessionId, makeStep('error', `LLM error: ${msg}`))
        setStatus(sessionId, 'error')
        return
      }

      if (resp.tool_calls && resp.tool_calls.length > 0) {
        // web-llm's conversation renderer ignores tool_calls on assistant messages —
        // it only uses `content`. For Hermes-2-Pro the raw model output IS the JSON
        // array of tool calls. Reconstruct it so the model sees what it generated.
        const rawToolCallJson = JSON.stringify(
          resp.tool_calls.map((tc) => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          }))
        )
        messages.push({ role: 'assistant', content: rawToolCallJson })

        for (const tc of resp.tool_calls) {
          const toolName = tc.function.name
          let parsedArgs: Record<string, unknown> = {}
          try { parsedArgs = JSON.parse(tc.function.arguments) } catch { /* ignore */ }

          log('tool call', toolName, parsedArgs)
          appendStep(sessionId, makeStep('call', tc.function.arguments, { toolName, args: parsedArgs }))

          const result = await executeTool(toolName, tc.function.arguments)
          log('tool result length:', result.length)
          appendStep(sessionId, makeStep('observe', result))

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.slice(0, 1500),
          })
        }
      } else {
        log('done, final content length:', resp.content?.length ?? 0)
        appendStep(sessionId, makeStep('done', resp.content ?? ''))
        setStatus(sessionId, 'done')
        return
      }
    }

    if (i === MAX_ITER) {
      console.warn('[agent] hit max iterations', MAX_ITER)
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
