import { useRepoExplorer } from './hooks/useRepoExplorer'
import RepoInput from './components/RepoInput'
import RepoSidebar from './components/RepoSidebar'
import GraphView from './components/GraphView'
import WikiView from './components/WikiView'
import NodeDetailPanel from './components/NodeDetailPanel'
import ViewToggle from './components/ViewToggle'
import ChatPanel from './components/ChatPanel'

export default function RepoExplorerPage() {
  const {
    meta, files, graph, selectedFile, view, setView,
    fetching, fetchError,
    wikiPages, generating,
    chat,
    handleFetch,
    handleRefetch,
    handleSelectFile,
    handleClosePanel,
    handleGenerateWiki,
    handleNodeClick,
  } = useRepoExplorer()

  const hasRepo = meta !== null && files.length > 0

  return (
    <div className="studio-root">
      {!hasRepo ? (
        <RepoInput onFetch={handleFetch} loading={fetching} error={fetchError} />
      ) : (
        <>
          <ViewToggle
            view={view}
            onChange={setView}
            meta={meta}
            fetching={fetching}
            onRefetch={handleRefetch}
          />

          <div className="flex flex-1 min-h-0">
            {/* Col 1: chat */}
            <ChatPanel
              messages={chat.messages}
              disabled={chat.disabled}
              onSend={chat.sendMessage}
            />

            {/* Col 2: main content */}
            <div className="flex flex-1 min-w-0">
              {view === 'graph' ? (
                <GraphView
                  graph={graph}
                  onNodeClick={handleNodeClick}
                  selectedNode={selectedFile?.path ?? null}
                />
              ) : (
                <WikiView
                  meta={meta}
                  selectedFile={selectedFile}
                  wikiPages={wikiPages}
                  generating={generating}
                  onGenerateWiki={handleGenerateWiki}
                  onClose={handleClosePanel}
                />
              )}
            </div>

            {/* Col 3: file tree */}
            {view === 'graph' && selectedFile ? (
              <NodeDetailPanel
                file={selectedFile}
                meta={meta}
                wikiPages={wikiPages}
                generating={generating}
                onGenerateWiki={handleGenerateWiki}
                onClose={handleClosePanel}
              />
            ) : (
              <RepoSidebar
                files={files}
                selectedPath={selectedFile?.path ?? null}
                onSelect={handleSelectFile}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
