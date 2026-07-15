import { useState } from 'react'
import { streamComplete, interruptGenerate } from '@/lib/llm/engine'
import { useSettingsStore } from '@/store/settingsStore'
import { createLogger } from '@/lib/logger'

const log = createLogger('diagram:ai')

const THINK_BUDGET_CHARS = 2000

const SYSTEM_MSG =
  'Output only valid Mermaid diagram syntax. Start directly with the diagram type keyword (flowchart TD, sequenceDiagram, erDiagram, etc.). No explanation. No text before or after the diagram. No markdown code fences.'

// After streaming, pull the actual mermaid block out of whatever the model produced.
// Handles: extra prose, markdown fences, mixed output from smaller models.
function extractMermaid(raw: string): string {
  // Strip think blocks
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Strip markdown fences
  text = text.replace(/^```(?:mermaid)?\s*/gim, '').replace(/^```\s*$/gim, '').trim()
  // Find first mermaid keyword and return from there
  const m = text.match(
    /^(flowchart|graph\s+[A-Z]+|sequenceDiagram|erDiagram|classDiagram|stateDiagram[-v2]*|gantt|pie\b|gitGraph|mindmap|timeline)/m,
  )
  return m ? text.slice(text.indexOf(m[0])).trim() : text
}

function openThinkingLength(text: string): number {
  const start = text.lastIndexOf('<think>')
  if (start === -1) return 0
  const end = text.indexOf('</think>', start)
  if (end !== -1) return 0
  return text.length - start
}

function stripThinking(text: string): string {
  const withoutComplete = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const thinkStart = withoutComplete.indexOf('<think>')
  return thinkStart !== -1 ? withoutComplete.slice(0, thinkStart) : withoutComplete
}

export type DiagramAIStatus = 'idle' | 'thinking' | 'generating'

export function useDiagramAI(onCode: (code: string) => void) {
  const [status, setStatus] = useState<DiagramAIStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const { ragLlmModel } = useSettingsStore()

  const isGenerating = status !== 'idle'

  async function generate(prompt: string) {
    log.log(`generate() — model="${ragLlmModel}" prompt="${prompt}"`)
    setStatus('thinking')
    setError(null)
    let accumulated = ''
    let tokenCount = 0
    let interrupted = false
    const done = log.time('streamComplete')
    try {
      log.log('starting streamComplete…')
      for await (const token of streamComplete(ragLlmModel, [
        { role: 'system', content: SYSTEM_MSG },
        { role: 'user', content: prompt },
      ], { max_tokens: 4096 })) {
        tokenCount++
        accumulated += token
        if (tokenCount <= 5 || tokenCount % 50 === 0) {
          log.log(`token #${tokenCount} | len=${accumulated.length}`)
        }

        const thinkLen = openThinkingLength(accumulated)
        if (thinkLen > THINK_BUDGET_CHARS) {
          log.warn(`runaway <think> block (${thinkLen} chars) — interrupting`)
          interruptGenerate()
          interrupted = true
          setError(`Model exceeded thinking budget (${THINK_BUDGET_CHARS} chars) without producing output. Try a non-thinking model.`)
          break
        }

        // Flip to 'generating' once thinking block closes
        const stripped = stripThinking(accumulated)
        if (stripped.trim()) {
          setStatus('generating')
          onCode(stripped)
        }
      }

      if (!interrupted) {
        done(`done — ${tokenCount} tokens`)
        log.log('raw output:', accumulated)
        // Final extraction pass — cleans up any extra prose / fences small models emit
        const final = extractMermaid(accumulated)
        log.log('extracted mermaid:', final)
        if (final.trim()) onCode(final)
      }
    } catch (e) {
      log.error('generation failed', e)
      setError(String(e))
    } finally {
      setStatus('idle')
    }
  }

  return { generate, isGenerating, status, error }
}
