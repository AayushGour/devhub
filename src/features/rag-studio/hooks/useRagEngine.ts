import { useState, useCallback, useRef } from 'react'
import { getEmbedder } from '@/lib/llm/embed'
import { getEngine, streamComplete } from '@/lib/llm/engine'
import { getModelById, formatVram, DEFAULT_MODEL_ID } from '@/lib/llm/models'
import { ingestFile } from '../utils/ingest'
import { retrieveMulti, retrieve } from '../utils/retrieve'
import { routeQuery, expandQuery, expandQueryWithContext } from '../utils/queryExpansion'
import { ragSystemPrompt, noDocsSystemPrompt } from '../utils/prompts'
import { useSettingsStore } from '@/store/settingsStore'
import { clearAll, clearBySource, getSourceFiles, countNodes } from '../utils/vectorDb'
import { useIndexingStore } from '@/store/indexingStore'

// ── Types ─────────────────────────────────────────────────────────

export interface DocEntry {
  name: string
  status: 'processing' | 'done' | 'error'
  statusText: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  streaming?: boolean
  timestamp: number
  generationMs?: number
}

export type OverlayState =
  | { open: false }
  | { open: true; label: string; pct: number; detail: string }

export type RetrievalStage = 'idle' | 'expanding' | 'retrieving' | 'generating'

// ── Hook ──────────────────────────────────────────────────────────

export function useRagEngine() {
  const contextAwareExpansion = useSettingsStore((s) => s.contextAwareExpansion)
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel) ?? DEFAULT_MODEL_ID

  const [docs, setDocs] = useState<DocEntry[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatDisabled, setChatDisabled] = useState(false)
  const [retrievalStage, setRetrievalStage] = useState<RetrievalStage>('idle')
  const embeddingReadyRef = useRef(false)

  const indexingStart = useIndexingStore((s) => s.start)
  const indexingSetProgress = useIndexingStore((s) => s.setProgress)
  const indexingFinish = useIndexingStore((s) => s.finish)
  const indexingSetError = useIndexingStore((s) => s.setError)

  const loadPersistedDocs = useCallback(async () => {
    const total = await countNodes()
    const files = await getSourceFiles()
    console.log('[RAG:hook] loadPersistedDocs — nodes in DB:', total, '| files:', files)
    if (files.length > 0) {
      setDocs(files.map((name) => ({ name, status: 'done', statusText: '' })))
    }
  }, [])

  const bootEmbedder = useCallback(async () => {
    if (embeddingReadyRef.current) return
    indexingStart('Loading embedding model', () => {})
    try {
      await getEmbedder((pct) => indexingSetProgress(pct, 100))
      embeddingReadyRef.current = true
    } catch (err) {
      console.error('Embedder load failed', err)
      indexingSetError('Failed to load embedding model. Refresh to retry.')
      return
    }
    indexingFinish()
  }, [indexingStart, indexingSetProgress, indexingSetError, indexingFinish])

  const upsertDoc = useCallback((name: string, status: DocEntry['status'], statusText: string) => {
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.name === name)
      const entry: DocEntry = { name, status, statusText }
      if (idx === -1) return [...prev, entry]
      const next = [...prev]
      next[idx] = entry
      return next
    })
  }, [])

  const processFiles = useCallback(
    async (files: File[]) => {
      await bootEmbedder()
      if (!embeddingReadyRef.current) return

      const modelEntry = getModelById(ragLlmModel)
      const sizeHint = modelEntry ? ` (~${formatVram(modelEntry.vramMB)})` : ''
      indexingStart(`Loading ${modelEntry?.label ?? 'LLM'}${sizeHint}`, () => {})
      try {
        await getEngine(ragLlmModel, (pct) => indexingSetProgress(pct, 100))
      } catch (err) {
        console.error('LLM load failed', err)
        indexingSetError('Failed to load LLM. Check network & refresh.')
        return
      }
      indexingFinish()

      indexingStart('Indexing documents', () => {})
      for (const file of files) {
        upsertDoc(file.name, 'processing', 'starting…')
        try {
          await ingestFile(file, ragLlmModel, (status) => {
            upsertDoc(file.name, 'processing', status)
          })
          upsertDoc(file.name, 'done', '')
        } catch (err) {
          console.error(`Ingest failed: ${file.name}`, err)
          upsertDoc(file.name, 'error', err instanceof Error ? err.message : String(err))
        }
      }
      indexingFinish()
    },
    [bootEmbedder, indexingStart, indexingSetProgress, indexingSetError, indexingFinish, upsertDoc, ragLlmModel],
  )

  const sendMessage = useCallback(
    async (question: string) => {
      if (chatDisabled) return
      setChatDisabled(true)

      const now = Date.now()
      const userMsg: ChatMessage = {
        id: `user-${now}`,
        role: 'user',
        content: question,
        timestamp: now,
      }
      const aiMsgId = `ai-${now}`
      const aiMsg: ChatMessage = { id: aiMsgId, role: 'ai', content: '', streaming: true, timestamp: now }
      setMessages((prev) => [...prev, userMsg, aiMsg])

      let genStart = 0

      try {
        setRetrievalStage('expanding')
        const route = await routeQuery(ragLlmModel, question).catch(() => 'rag' as const)

        if (route === 'direct') {
          console.log('[RAG:chat] routed to direct answer, skipping retrieval')
          setRetrievalStage('generating')
          genStart = Date.now()
          try {
            for await (const delta of streamComplete(
              ragLlmModel,
              [
                { role: 'system', content: 'You are a helpful conversational assistant.' },
                { role: 'user', content: question },
              ],
              { max_tokens: 1024 },
            )) {
              setMessages((prev) =>
                prev.map((m) => m.id === aiMsgId ? { ...m, content: m.content + delta } : m)
              )
            }
          } catch (err) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: 'Error generating response. Check console.', streaming: false }
                  : m,
              ),
            )
            console.error('Stream error', err)
          }
          return
        }

        let expansions: string[] = []
        if (contextAwareExpansion) {
          const seedNodes = await retrieve(question, 5)
          const contextSnippet = seedNodes.map((n) => n.text).join('\n\n').slice(0, 1500)
          expansions = await expandQueryWithContext(ragLlmModel, question, contextSnippet).catch(() => [])
        } else {
          expansions = await expandQuery(ragLlmModel, question).catch(() => [])
        }
        console.log('[RAG:chat] expansions:', expansions)

        setRetrievalStage('retrieving')
        const allQueries = [question, ...expansions]
        const nodes = await retrieveMulti(allQueries, 5)
        console.log('[RAG:chat] retrieved nodes after expansion:', nodes.length)

        let contextBlock = ''
        let charBudget = 3500
        for (const node of nodes) {
          const snippet = `[${node.sourceFile}]\n${node.rawChunk ?? node.text}`
          // Truncate individual snippets that are too long rather than skipping them
          const safeSnippet = snippet.length > charBudget ? snippet.slice(0, charBudget) : snippet
          contextBlock += safeSnippet + '\n\n'
          charBudget -= safeSnippet.length
          if (charBudget <= 0) break
        }

        console.log(`[RAG:chat] context block length=${contextBlock.length}, nodes used=${nodes.length}`)
        console.log('[RAG:chat] context preview:', contextBlock.slice(0, 300))

        const systemPrompt =
          nodes.length > 0 && contextBlock.trim().length > 0
            ? ragSystemPrompt(contextBlock)
            : noDocsSystemPrompt

        console.log('[RAG:chat] system prompt length:', systemPrompt.length)

        setRetrievalStage('generating')
        genStart = Date.now()

        try {
          for await (const delta of streamComplete(
            ragLlmModel,
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
            { max_tokens: 1536 },
          )) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: m.content + delta } : m,
              ),
            )
          }
        } catch (err) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: 'Error generating response. Check console.', streaming: false }
                : m,
            ),
          )
          console.error('Stream error', err)
        }
      } catch (err) {
        console.error('RAG pipeline error', err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
              : m,
          ),
        )
      } finally {
        const generationMs = genStart > 0 ? Date.now() - genStart : undefined
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, streaming: false, generationMs } : m)),
        )
        setRetrievalStage('idle')
        setChatDisabled(false)
      }
    },
    [chatDisabled, contextAwareExpansion, ragLlmModel],
  )

  const clearDocs = useCallback(async () => {
    const before = await countNodes()
    console.log('[RAG:hook] clearDocs — nodes before clear:', before)
    await clearAll()
    const after = await countNodes()
    console.log('[RAG:hook] clearDocs — nodes after clear:', after)
    setDocs([])
    setMessages([])
  }, [])

  const removeDoc = useCallback(async (name: string) => {
    await clearBySource(name)
    setDocs((prev) => prev.filter((d) => d.name !== name))
  }, [])

  return {
    docs,
    messages,
    chatDisabled,
    retrievalStage,
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  }
}
