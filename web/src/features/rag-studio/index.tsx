import { useEffect } from 'react'
import { useRagEngine } from './hooks/useRagEngine'
import RagToolbar from './components/RagToolbar'
import DropZone from './components/DropZone'
import DocList from './components/DocList'
import ChatPanel from './components/ChatPanel'

export default function RagStudioPage() {
  const {
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
  } = useRagEngine()

  useEffect(() => {
    bootEmbedder()
    loadPersistedDocs()
  }, [bootEmbedder, loadPersistedDocs])

  // The shared GPU engine self-unloads after an idle period (see lib/llm/engine).
  // We deliberately do NOT unload on unmount: an indexing job can outlive this page.

  return (
    <div className="studio-root">
      <RagToolbar onClearAll={clearDocs} />

      {gpuAvailable === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
          <span className="font-semibold shrink-0">CPU mode</span>
          <span className="text-amber-400/80">No GPU detected — running on CPU via WASM. Responses will be slower than usual.</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 flex flex-col gap-4 p-4 border-r border-border bg-surface overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-on-surface-muted uppercase tracking-widest mb-3">
              Documents
            </h2>
            <DropZone onFiles={processFiles} />
          </div>
          <DocList docs={docs} onRemove={removeDoc} />
        </aside>

        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            disabled={chatDisabled}
            stage={retrievalStage}
            onSend={sendMessage}
            onStop={stopGeneration}
          />
        </div>
      </div>
    </div>
  )
}
