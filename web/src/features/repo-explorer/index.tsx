import { useEffect } from 'react'
import { unloadModel } from '@/lib/llm/loadModel'
import { useRepoExplorer } from './hooks/useRepoExplorer'
import RepoInput from './components/RepoInput'
import RepoSidebar from './components/RepoSidebar'
import GraphView from './components/GraphView'
import NodeDetailPanel from './components/NodeDetailPanel'
import RepoHeader from './components/RepoHeader'
import ChatPanel from './components/ChatPanel'

export default function RepoExplorerPage() {
  const {
    meta, files, graph, selectedFile,
    fetching, fetchError,
    wikiPages, generating,
    chat,
    indexedRepos,
    handleFetch,
    handleRefetch,
    handleDeleteRepo,
    handleSelectFile,
    handleClosePanel,
    handleGenerateWiki,
    handleNodeClick,
  } = useRepoExplorer()

  const hasRepo = meta !== null && files.length > 0

  useEffect(() => () => { unloadModel() }, [])

  return (
    <div className="studio-root">
      {!hasRepo ? (
        <RepoInput
          onFetch={handleFetch}
          loading={fetching}
          error={fetchError}
          repos={indexedRepos}
          onOpen={(r) => handleFetch(r.url)}
          onDelete={(r) => handleDeleteRepo(r.owner, r.repo)}
        />
      ) : (
        <>
          <RepoHeader meta={meta} fetching={fetching} onRefetch={handleRefetch} />

          <div className="flex flex-1 min-h-0">
            {/* Col 1: chat */}
            <ChatPanel
              messages={chat.messages}
              disabled={chat.disabled}
              onSend={chat.sendMessage}
            />

            {/* Col 2: dependency graph */}
            <div className="flex flex-1 min-w-0">
              <GraphView
                graph={graph}
                onNodeClick={handleNodeClick}
                selectedNode={selectedFile?.path ?? null}
              />
            </div>

            {/* Col 3: file wiki when a node is selected, else file tree */}
            {selectedFile ? (
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
                selectedPath={null}
                onSelect={handleSelectFile}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
