import { useCallback, useState } from 'react'
import { streamComplete } from '@/lib/llm/engine'
import { embed } from '@/lib/llm/embed'
import { useSettingsStore } from '@/store/settingsStore'
import { createLogger } from '@/lib/logger'
import type { RepoFile, RepoMeta } from '../types'

const log = createLogger('repo:chat')

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
  timestamp: number
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function retrieveTopK(
  queryVec: number[],
  embeddings: Map<string, number[]>,
  files: RepoFile[],
  k = 5,
): RepoFile[] {
  const fileMap = new Map(files.map((f) => [f.path, f]))
  const scored = [...embeddings.entries()]
    .map(([path, vec]) => ({ path, score: cosineSim(queryVec, vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  return scored.map((s) => fileMap.get(s.path)).filter(Boolean) as RepoFile[]
}

function buildContext(files: RepoFile[]): string {
  let budget = 4000
  let ctx = ''
  for (const f of files) {
    const snippet = `=== ${f.path} ===\n${f.content.slice(0, 800)}`
    if (snippet.length > budget) break
    ctx += snippet + '\n\n'
    budget -= snippet.length
  }
  return ctx
}

export function useRepoChat(
  meta: RepoMeta | null,
  files: RepoFile[],
  embeddings: Map<string, number[]>,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [disabled, setDisabled] = useState(false)
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel)

  const sendMessage = useCallback(async (text: string) => {
    if (disabled || !meta) {
      log.warn(`send blocked (disabled=${disabled}, hasMeta=${!!meta})`)
      return
    }
    log.log(`send: "${text.slice(0, 80)}" (${embeddings.size} embeddings, ${files.length} files)`)

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

    try {
      const queryVec = await embed(text)
      const topFiles = retrieveTopK(queryVec, embeddings, files)
      const context = buildContext(topFiles)
      log.log(`retrieved ${topFiles.length} files: ${topFiles.map((f) => f.path).join(', ')}`)
      log.log(`context: ${context.length} chars, streaming with ${ragLlmModel}`)

      const systemPrompt = `You are a code assistant for the ${meta.owner}/${meta.repo} repository.
Answer questions about the codebase using the file excerpts below.
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
      setMessages((prev) => prev.map((m) => m.id === aiId ? { ...m, streaming: false } : m))
      setDisabled(false)
    }
  }, [disabled, meta, files, embeddings, ragLlmModel])

  return { messages, sendMessage, disabled }
}
