import RepoSidebar from './RepoSidebar'
import NodeDetailPanel from './NodeDetailPanel'
import type { RepoFile, RepoMeta } from '../types'
import type { useWikiGen } from '../hooks/useWikiGen'

type WikiGenReturn = ReturnType<typeof useWikiGen>

interface Props {
  files: RepoFile[]
  meta: RepoMeta
  selectedFile: RepoFile | null
  wikiPages: WikiGenReturn['wikiPages']
  generating: WikiGenReturn['generating']
  onSelectFile: (file: RepoFile) => void
  onGenerateWiki: (file: RepoFile) => void
}

export default function WikiView({
  files,
  meta,
  selectedFile,
  wikiPages,
  generating,
  onSelectFile,
  onGenerateWiki,
}: Props) {
  return (
    <div className="flex flex-1 min-h-0">
      <RepoSidebar
        files={files}
        selectedPath={selectedFile?.path ?? null}
        onSelect={onSelectFile}
      />
      <div className="flex-1 min-w-0">
        <NodeDetailPanel
          file={selectedFile}
          meta={meta}
          wikiPages={wikiPages}
          generating={generating}
          onGenerateWiki={onGenerateWiki}
          onClose={() => onSelectFile(files[0])}
        />
      </div>
    </div>
  )
}
