import { useState, useCallback, useRef } from 'react'
import { getEmbedder } from '../utils/embed'
import { getEngine, streamComplete } from '../utils/llm'
import { ingestFile } from '../utils/ingest'
import { retrieve } from '../utils/retrieve'
import { clearAll, clearBySource, getSourceFiles } from '../utils/vectorDb'

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
}

export type OverlayState =
  | { open: false }
  | { open: true; label: string; pct: number; detail: string }

// ── Hook ──────────────────────────────────────────────────────────

export function useRagEngine() {
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [overlay, setOverlay] = useState<OverlayState>({ open: false })
  const [chatDisabled, setChatDisabled] = useState(false)
  const embeddingReadyRef = useRef(false)

  const showOverlay = useCallback((label: string) => {
    setOverlay({ open: true, label, pct: 0, detail: '' })
  }, [])

  const updateOverlay = useCallback((pct: number, detail: string) => {
    setOverlay((prev) =>
      prev.open ? { ...prev, pct, detail } : prev,
    )
  }, [])

  const hideOverlay = useCallback(() => {
    setOverlay({ open: false })
  }, [])

  const loadPersistedDocs = useCallback(async () => {
    const files = await getSourceFiles()
    if (files.length > 0) {
      setDocs(files.map((name) => ({ name, status: 'done', statusText: '' })))
    }
  }, [])

  const bootEmbedder = useCallback(async () => {
    if (embeddingReadyRef.current) return
    showOverlay('Loading embedding model…')
    try {
      await getEmbedder((pct, file) => updateOverlay(pct, file))
      embeddingReadyRef.current = true
    } catch (err) {
      console.error('Embedder load failed', err)
      setOverlay({ open: true, label: 'Failed to load embedding model. Refresh to retry.', pct: 0, detail: '' })
      return
    }
    hideOverlay()
  }, [showOverlay, updateOverlay, hideOverlay])

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

      showOverlay('Loading LLM (first run ~2.2 GB)…')
      try {
        await getEngine((pct, text) => updateOverlay(pct, text))
      } catch (err) {
        console.error('LLM load failed', err)
        setOverlay({ open: true, label: 'Failed to load LLM. Check network & refresh.', pct: 0, detail: '' })
        return
      }
      hideOverlay()

      for (const file of files) {
        upsertDoc(file.name, 'processing', 'starting…')
        try {
          await ingestFile(file, (status) => {
            upsertDoc(file.name, 'processing', status)
          })
          upsertDoc(file.name, 'done', '')
        } catch (err) {
          console.error(`Ingest failed: ${file.name}`, err)
          upsertDoc(file.name, 'error', String(err))
        }
      }
    },
    [bootEmbedder, showOverlay, updateOverlay, hideOverlay, upsertDoc],
  )

  const sendMessage = useCallback(
    async (question: string) => {
      if (chatDisabled) return
      setChatDisabled(true)

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
      }
      setMessages((prev) => [...prev, userMsg])

      const nodes = await retrieve(question, 5)
      console.log('[RAG:chat] retrieved nodes:', nodes.length)

      let contextBlock = ''
      let charBudget = 8000
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
          ? `You are a helpful assistant. Answer the user's question using ONLY the context below.\nIf the answer is not in the context, say "I couldn't find that in the uploaded documents."\n\n=== CONTEXT ===\n${contextBlock.trim()}\n=== END CONTEXT ===`
          : `You are a helpful assistant. The user has not uploaded any documents yet. Let them know they can drop .txt or .md files on the left panel.`

      console.log('[RAG:chat] system prompt length:', systemPrompt.length)

      const aiMsgId = `ai-${Date.now()}`
      const aiMsg: ChatMessage = { id: aiMsgId, role: 'ai', content: '', streaming: true }
      setMessages((prev) => [...prev, aiMsg])

      try {
        for await (const delta of streamComplete(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
          ],
          { max_tokens: 512 },
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

      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, streaming: false } : m)),
      )
      setChatDisabled(false)
    },
    [chatDisabled],
  )

  const clearDocs = useCallback(async () => {
    await clearAll()
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
    overlay,
    chatDisabled,
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  }
}
