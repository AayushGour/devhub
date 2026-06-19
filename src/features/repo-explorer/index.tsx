import { useRepoExplorer } from './hooks/useRepoExplorer'
import RepoInput from './components/RepoInput'
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
    handleSelectFile,
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
            repoLabel={`${meta.owner}/${meta.repo}`}
          />

          <div className="flex flex-1 min-h-0">
            {view === 'graph' ? (
              <>
                <GraphView
                  graph={graph}
                  onNodeClick={handleNodeClick}
                  selectedNode={selectedFile?.path ?? null}
                />
                {selectedFile && (
                  <NodeDetailPanel
                    file={selectedFile}
                    meta={meta}
                    wikiPages={wikiPages}
                    generating={generating}
                    onGenerateWiki={handleGenerateWiki}
                    onClose={() => handleSelectFile(files[0])}
                  />
                )}
              </>
            ) : (
              <WikiView
                files={files}
                meta={meta}
                selectedFile={selectedFile}
                wikiPages={wikiPages}
                generating={generating}
                onSelectFile={handleSelectFile}
                onGenerateWiki={handleGenerateWiki}
              />
            )}
          </div>

          <ChatPanel
            messages={chat.messages}
            disabled={chat.disabled}
            onSend={chat.sendMessage}
          />
        </>
      )}
    </div>
  )
}
