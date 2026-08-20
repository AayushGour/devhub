import { useCallback, useState } from 'react'
import { streamComplete } from '@/lib/llm/engine'
import { useSettingsStore } from '@/store/settingsStore'
import { createLogger } from '@/lib/logger'
import { retrieveRepo, type ScoredChunk } from '../utils/retrieveRepo'
import { repoKey } from '../utils/repoDb'
import type { RepoMeta, Citation } from '../types'

const log = createLogger('repo:chat')

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
  timestamp: number
  citations?: Citation[]
  durationMs?: number // wall time from send → stream end (retrieval + generation)
}

// Pack retrieved chunks into a context block, tagged with path + line range so
// the model can cite exact locations.
function buildContext(hits: ScoredChunk[]): string {
  let budget = 6000
  let ctx = ''
  for (const h of hits) {
    const block = `=== ${h.path} (L${h.startLine}-${h.endLine}) ===\n${h.text}`
    if (block.length > budget) break
    ctx += block + '\n\n'
    budget -= block.length
  }
  return ctx
}

export function useRepoChat(meta: RepoMeta | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [disabled, setDisabled] = useState(false)
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)

  const sendMessage = useCallback(async (text: string) => {
    if (disabled || !meta) {
      log.warn(`send blocked (disabled=${disabled}, hasMeta=${!!meta})`)
      return
    }
    log.log(`send: "${text.slice(0, 80)}"`)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    const aiId = crypto.randomUUID()
    const aiMsg: ChatMessage = {
      id: aiId,
      role: 'ai',
      content: '',
      streaming: true,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg, aiMsg])
    setDisabled(true)
    const startedAt = performance.now()

    try {
      const hits = await retrieveRepo(repoKey(meta.owner, meta.repo), text)
      const citations: Citation[] = hits.map((h) => ({
        path: h.path,
        startLine: h.startLine,
        endLine: h.endLine,
        score: h.score,
      }))
      const context = buildContext(hits)
      log.log(`retrieved ${hits.length} chunks, context ${context.length} chars, model ${ragLlmModel}`)

      // Surface citations on the AI message immediately (before tokens stream).
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, citations } : m))

      const systemPrompt = `You are a code assistant for the ${meta.owner}/${meta.repo} repository.
Answer questions about the codebase using the file excerpts below. Each excerpt is
tagged with its file path and line range — cite them when relevant.
If the answer is not in the context, say so honestly.

${context.trim()}`

      for await (const delta of streamComplete(
        ragLlmModel,
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
        { max_tokens: 1024 },
      )) {
        setMessages((prev) =>
          prev.map((m) => m.id === aiId ? { ...m, content: m.content + delta } : m),
        )
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId ? { ...m, content: 'Error generating response.', streaming: false } : m,
        ),
      )
      log.error('chat error', err)
    } finally {
      const durationMs = Math.round(performance.now() - startedAt)
      log.log(`response complete in ${durationMs}ms`)
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, streaming: false, durationMs } : m))
      setDisabled(false)
    }
  }, [disabled, meta, ragLlmModel])

  return { messages, sendMessage, disabled }
}
