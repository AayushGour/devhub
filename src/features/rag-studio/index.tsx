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
    bootEmbedder,
    loadPersistedDocs,
    processFiles,
    sendMessage,
    clearDocs,
    removeDoc,
  } = useRagEngine()

  useEffect(() => {
    bootEmbedder()
    loadPersistedDocs()
  }, [bootEmbedder, loadPersistedDocs])

  return (
    <div className="studio-root">
      <RagToolbar onClearAll={clearDocs} />

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
          />
        </div>
      </div>
    </div>
  )
}
