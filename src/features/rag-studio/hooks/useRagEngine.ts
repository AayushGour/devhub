import { useState, useCallback, useRef } from 'react'
import { getEmbedder } from '../utils/embed'
import { getEngine, streamComplete, interruptGenerate } from '../utils/llm'
import { getModelById, formatVram, DEFAULT_MODEL_ID, DEFAULT_CPU_MODEL_ID, getModelsForEnvironment } from '../utils/models'
import { isWebGpuAvailable } from '../utils/webgpu'
import { ingestFile } from '../utils/ingest'
import { retrieveMulti, retrieve } from '../utils/retrieve'
import { routeQuery, expandQuery, expandQueryWithContext } from '../utils/queryExpansion'
import { ragSystemPrompt, noDocsSystemPrompt } from '../utils/prompts'
import { useSettingsStore } from '@/store/settingsStore'
import { clearAll, clearBySource, getSourceFiles, countNodes } from '../utils/vectorDb'
import { useIndexingStore } from '@/store/indexingStore'
import { createLogger } from '@/lib/logger'

const log = createLogger('rag:engine')

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
  model?: string
}

export type OverlayState =
  | { open: false }
  | { open: true; label: string; pct: number; detail: string; error?: boolean }

export type RetrievalStage = 'idle' | 'expanding' | 'retrieving' | 'generating'

// ── Hook ──────────────────────────────────────────────────────────

export function useRagEngine() {
  const contextAwareExpansion = useSettingsStore((s) => s.contextAwareExpansion)
  const ragLlmModel = useSettingsStore((s) => s.ragLlmModel) ?? DEFAULT_MODEL_ID
  const setRagLlmModel = useSettingsStore((s) => s.setRagLlmModel)

  const [docs, setDocs] = useState<DocEntry[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatDisabled, setChatDisabled] = useState(false)
  const [retrievalStage, setRetrievalStage] = useState<RetrievalStage>('idle')
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null)
  const embeddingReadyRef = useRef(false)
  const stopRef = useRef(false)

  // Select actions individually (stable refs) — never subscribe to the whole
  // store, or every progress tick would re-render this hook's consumers.
  const indexingStart = useIndexingStore((s) => s.start)
  const indexingSetProgress = useIndexingStore((s) => s.setProgress)
  const indexingSetError = useIndexingStore((s) => s.setError)
  const indexingFinish = useIndexingStore((s) => s.finish)

  const loadPersistedDocs = useCallback(async () => {
    const total = await countNodes()
    const files = await getSourceFiles()
    log.log('loadPersistedDocs — nodes in DB:', total, '| files:', files)
    if (files.length > 0) {
      setDocs(files.map((name) => ({ name, status: 'done', statusText: '' })))
    }
  }, [])

  const bootEmbedder = useCallback(async () => {
    if (embeddingReadyRef.current) return

    // Detect GPU once and correct the stored model if it's wrong for this environment
    const gpu = await isWebGpuAvailable()
    setGpuAvailable(gpu)
    const validModels = getModelsForEnvironment(gpu)
    if (!validModels.some((m) => m.id === ragLlmModel)) {
      setRagLlmModel(gpu ? DEFAULT_MODEL_ID : DEFAULT_CPU_MODEL_ID)
    }

    indexingStart('Loading embedding model', () => { })
    try {
      await getEmbedder((pct, _file) => indexingSetProgress(pct, 100))
      embeddingReadyRef.current = true
    } catch (err) {
      log.error('embedder load failed', err)
      indexingSetError('Failed to load embedding model. Refresh to retry.')
      return
    }
    indexingFinish()
  }, [indexingStart, indexingSetProgress, indexingSetError, indexingFinish, ragLlmModel, setRagLlmModel])

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
      log.log(`processFiles: ${files.length} file(s): ${files.map((f) => f.name).join(', ')}`)
      await bootEmbedder()
      if (!embeddingReadyRef.current) {
        log.warn('embedder not ready — aborting processFiles')
        return
      }

      const modelEntry = getModelById(ragLlmModel)
      const sizeHint = modelEntry ? ` (~${formatVram(modelEntry.vramMB)})` : ''
      indexingStart(`Loading ${modelEntry?.label ?? 'LLM'}${sizeHint}`, () => { })
      try {
        await getEngine(ragLlmModel, (pct, _text) => indexingSetProgress(pct, 100))
      } catch (err) {
        log.error('LLM load failed', err)
        indexingSetError('Failed to load LLM. Check network & refresh.')
        return
      }
      indexingFinish()

      indexingStart('Indexing documents', () => { })
      for (const file of files) {
        upsertDoc(file.name, 'processing', 'starting…')
        try {
          await ingestFile(file, ragLlmModel, (status) => {
            upsertDoc(file.name, 'processing', status)
          })
          upsertDoc(file.name, 'done', '')
        } catch (err) {
          log.error(`ingest failed: ${file.name}`, err)
          upsertDoc(file.name, 'error', err instanceof Error ? err.message : String(err))
        }
      }
      indexingFinish()
    },
    [bootEmbedder, indexingStart, indexingSetProgress, indexingSetError, indexingFinish, upsertDoc, ragLlmModel],
  )

  const sendMessage = useCallback(
    async (question: string) => {
      if (chatDisabled) {
        log.warn('sendMessage ignored — already generating')
        return
      }
      log.log(`sendMessage: "${question.slice(0, 80)}" (model=${ragLlmModel})`)
      setChatDisabled(true)
      stopRef.current = false

      const now = Date.now()
      const userMsg: ChatMessage = {
        id: `user-${now}`,
        role: 'user',
        content: question,
        timestamp: now,
      }
      const aiMsgId = `ai-${now}`
      const aiMsg: ChatMessage = { id: aiMsgId, role: 'ai', content: '', streaming: true, timestamp: now, model: ragLlmModel }
      setMessages((prev) => [...prev, userMsg, aiMsg])

      let genStart = 0

      try {
        setRetrievalStage('expanding')
        const route = await routeQuery(ragLlmModel, question).catch(() => 'rag' as const)
        if (stopRef.current) return

        if (route === 'direct') {
          log.log('routed to direct answer, skipping retrieval')
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
              if (stopRef.current) break
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
            log.error('stream error', err)
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
        if (stopRef.current) return
        log.log('expansions:', expansions)

        setRetrievalStage('retrieving')
        const allQueries = [question, ...expansions]
        const nodes = await retrieveMulti(allQueries, 5)
        if (stopRef.current) return
        log.log('retrieved nodes after expansion:', nodes.length)

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

        log.log(`context block length=${contextBlock.length}, nodes used=${nodes.length}`)
        log.log('context preview:', contextBlock.slice(0, 300))

        const systemPrompt =
          nodes.length > 0 && contextBlock.trim().length > 0
            ? ragSystemPrompt(contextBlock)
            : noDocsSystemPrompt

        log.log('system prompt length:', systemPrompt.length)

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
            if (stopRef.current) break
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
          log.error('stream error', err)
        }
      } catch (err) {
        log.error('pipeline error', err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
              : m,
          ),
        )
      } finally {
        const generationMs = genStart > 0 ? Date.now() - genStart : undefined
        const stopped = stopRef.current
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== aiMsgId) return m
            const content = stopped && !m.content.trim() ? '_Stopped._' : m.content
            return { ...m, content, streaming: false, generationMs }
          }),
        )
        setRetrievalStage('idle')
        setChatDisabled(false)
      }
    },
    [chatDisabled, contextAwareExpansion, ragLlmModel],
  )

  const stopGeneration = useCallback(() => {
    log.log('stopGeneration requested')
    stopRef.current = true
    interruptGenerate()
  }, [])

  const clearDocs = useCallback(async () => {
    const before = await countNodes()
    log.log('clearDocs — nodes before clear:', before)
    await clearAll()
    const after = await countNodes()
    log.log('clearDocs — nodes after clear:', after)
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
    gpuAvailable,
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    stopGeneration,
    clearDocs,
    removeDoc,
  }
}
