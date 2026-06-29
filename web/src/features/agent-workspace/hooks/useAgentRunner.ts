import { useRef } from 'react'
import { callWithTools, complete, interruptGenerate, type AgentMessage, type ToolDefinition } from '@/lib/llm/engine'
// complete is used only for context compaction summaries
import { ensureModelLoaded } from '@/lib/llm/loadModel'
import { getModelById } from '@/lib/llm/models'
import { useAgentStore, type AgentStep } from '../utils/agentStore'
import { getAllMemoryKeys } from '../tools/memory'

const log = (...args: unknown[]) => console.log('[agent]', ...args)

// Tool routing is delegated to the model (via `tool_choice: 'auto'`) rather than a
// keyword heuristic. This policy tells it when a tool is actually warranted so that
// conversational and self-referential questions are answered directly instead of
// triggering spurious tool calls.
const TOOL_USAGE_POLICY = `You are an autonomous agent with access to tools. Think before using one.

- Answer directly from your own knowledge whenever you can.
- Call a tool ONLY when the task genuinely requires it: current/live web data, executing code, reading or writing files, or storing/recalling memory.
- Never call a tool to answer questions about yourself, your capabilities, or which tools you have — answer those directly.
- To retrieve previously stored data you MUST call memory(recall) — never answer from conversation context, as stored values persist across sessions.
- Once you have enough information, give your final answer with no further tool calls.`

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
  const runIdRef = useRef(0)
  const { createSession, appendStep, setStatus } = useAgentStore()

  async function run(task: string) {
    // Supersede any in-flight run: bump the token and interrupt the engine so the
    // previous run's queued generation returns, freeing the shared gen-lock. The
    // old loop sees its token is stale (via isCurrent) and bails — a new task thus
    // starts from a clean context instead of queuing behind the old one.
    const myRunId = ++runIdRef.current
    abortRef.current = false
    interruptGenerate()
    const isCurrent = () => runIdRef.current === myRunId && !abortRef.current

    const enabledTools = allToolSchemas.map((t) => t.function.name)
    const sessionId = createSession(task, modelId, enabledTools)
    log('session started', { sessionId, modelId, tools: enabledTools, task })

    // Load the model through the shared loader so a fresh download surfaces in the
    // common IndexingFooter (same UX as RAG) instead of silently blocking.
    try {
      await ensureModelLoaded(modelId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[agent] model load failed:', err)
      appendStep(sessionId, makeStep('error', `Model load failed: ${msg}`))
      setStatus(sessionId, 'error')
      return
    }
    if (!isCurrent()) {
      setStatus(sessionId, 'stopped')
      return
    }

    const modelEntry = getModelById(modelId)
    const contextWindow = modelEntry?.contextWindow ?? 4096
    const threshold = contextWindow * 0.6

    // Routing is the model's job: with `tool_choice: 'auto'` and TOOL_USAGE_POLICY
    // it answers conversational/self-referential questions directly and only calls a
    // tool when the task needs one. The old keyword heuristic mis-routed chat into
    // the tool loop (e.g. a short MCP tool name like "get" matching as a substring).
    //
    // The policy is prepended to the first user message rather than sent as a
    // `system` message: Hermes-2-Pro (and other web-llm tool models) reserve the
    // system slot for web-llm's own injected tool-calling prompt.
    //
    // Inject stored memory keys so the model knows what it can recall across sessions.
    const memoryEnabled = allToolSchemas.some((t) => t.function.name === 'memory')
    let memoryHint = ''
    if (memoryEnabled) {
      try {
        const storedKeys = await getAllMemoryKeys()
        if (storedKeys.length > 0) {
          memoryHint = `\n[Stored memory keys: ${storedKeys.join(', ')}. Use memory(recall) to retrieve values.]`
        }
      } catch { /* non-fatal */ }
    }

    const firstContent =
      allToolSchemas.length > 0 ? `${TOOL_USAGE_POLICY}${memoryHint}\n\n---\n\nTask: ${task}` : task

    let messages: AgentMessage[] = [
      { role: 'user', content: firstContent },
    ]

    const MAX_ITER = 8
    // Cap how many rounds of tool calls we allow before forcing a text answer.
    // Weak local models otherwise keep firing tools forever and never conclude.
    const MAX_TOOL_ROUNDS = 4
    // Loop detection: weak local models keep firing tool calls after they already
    // have the answer. We record each call's signature; an exact repeat means the
    // model is spinning. We also count per-tool-name calls so a model that varies
    // args trivially (which dodges the exact-signature check) still gets stopped.
    // seenSigs tracks occurrence count so a single retry (e.g. after a tool error)
    // is allowed — only a second repeat is treated as a genuine loop.
    const seenSigs = new Map<string, number>()
    const toolNameCounts = new Map<string, number>()
    const observations: string[] = []
    let toolRounds = 0
    let stopReason: 'repeat' | 'maxiter' | 'maxrounds' = 'maxiter'

    let i = 0
    for (; i < MAX_ITER; i++) {
      log(`iteration ${i + 1}/${MAX_ITER}, messages:`, messages.length)

      if (!isCurrent()) {
        log('run superseded or aborted')
        setStatus(sessionId, 'stopped')
        return
      }

      if (countTokens(messages) > threshold) {
        log('compacting context, token estimate exceeded threshold', threshold)
        messages = await compactMessages(messages, modelId)
        appendStep(sessionId, makeStep('compact', 'earlier context summarised'))
      }

      // Once the tool-round budget is spent, force a tools-disabled call so the
      // model MUST produce a final text answer from the gathered context.
      const forceAnswer = toolRounds >= MAX_TOOL_ROUNDS
      if (forceAnswer) {
        log('tool-round budget spent — forcing tools-disabled answer')
        stopReason = 'maxrounds'
        break
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

      // A newer task may have started while the LLM call was in flight (it gets
      // interrupted, but the promise still resolves) — drop this stale result.
      if (!isCurrent()) {
        log('run superseded during LLM call')
        setStatus(sessionId, 'stopped')
        return
      }

      // No tool calls → the model gave its final text answer. Done.
      if (!resp.tool_calls || resp.tool_calls.length === 0) {
        log('done, final content length:', resp.content?.length ?? 0)
        appendStep(sessionId, makeStep('done', resp.content ?? ''))
        setStatus(sessionId, 'done')
        return
      }

      // Identical call already issued → model may be retrying after an error (allow
      // once) or genuinely looping (stop on second repeat).
      const sig = JSON.stringify(resp.tool_calls.map((tc) => [tc.function.name, tc.function.arguments]))
      const sigCount = (seenSigs.get(sig) ?? 0) + 1
      if (sigCount >= 2) {
        log('repeated tool call detected — synthesizing final answer')
        stopReason = 'repeat'
        break
      }
      seenSigs.set(sig, sigCount)

      // Same tool hammered repeatedly (even with varied args) → also a loop.
      let looping = false
      for (const tc of resp.tool_calls) {
        const n = (toolNameCounts.get(tc.function.name) ?? 0) + 1
        toolNameCounts.set(tc.function.name, n)
        if (n >= 3) looping = true
      }
      if (looping) {
        log('same tool called 3+ times — synthesizing final answer')
        stopReason = 'repeat'
        break
      }
      toolRounds++

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

        observations.push(`${toolName}(${tc.function.arguments}) →\n${result.slice(0, 1500)}`)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.slice(0, 1500),
        })
      }
    }
    if (i === MAX_ITER) stopReason = 'maxiter'

    if (!isCurrent()) {
      log('run superseded before synthesis')
      setStatus(sessionId, 'stopped')
      return
    }

    // Tool phase ended without a final answer (model looped or hit the budget).
    // First try a tools-disabled pass over the FULL conversation so the model can
    // answer from everything it saw. This beats the observations-only fallback
    // because it keeps the original task framing and message order intact.
    log('forcing final synthesis', { stopReason, observations: observations.length })
    appendStep(sessionId, makeStep('think', 'Synthesizing final answer from tool results'))

    let synthesis = ''
    try {
      const forced = await callWithTools(
        modelId,
        [...messages, {
          role: 'user',
          content: 'Stop. Do not call any more tools. Using the information already gathered above, write the final answer to the task now.',
        }],
        allToolSchemas,
        { max_tokens: 1024, toolChoice: 'none' },
      )
      synthesis = forced.content ?? ''
    } catch (err) {
      log('forced tools-disabled pass failed', err)
    }

    // Fall back to a standalone synthesis from the raw observations if the forced
    // pass returned nothing (some builds still emit empty content under pressure).
    if (!synthesis.trim()) {
      synthesis = await complete(
        modelId,
        [{
          role: 'user',
          content:
            `Task: ${task}\n\n` +
            `You used tools and gathered these results:\n\n${observations.join('\n\n')}\n\n` +
            `Write the final answer to the task using these results. Be direct and complete. ` +
            `Do not call tools or mention them.`,
        }],
        { max_tokens: 1024 },
      ).catch((err) => `Error: ${err instanceof Error ? err.message : String(err)}`)
    }

    appendStep(sessionId, makeStep('done', synthesis))
    setStatus(sessionId, 'done')
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
