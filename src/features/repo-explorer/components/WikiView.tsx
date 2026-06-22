import NodeDetailPanel from './NodeDetailPanel'
import type { RepoFile, RepoMeta } from '../types'
import type { useWikiGen } from '../hooks/useWikiGen'

type WikiGenReturn = ReturnType<typeof useWikiGen>

interface Props {
  meta: RepoMeta
  selectedFile: RepoFile | null
  wikiPages: WikiGenReturn['wikiPages']
  generating: WikiGenReturn['generating']
  onGenerateWiki: (file: RepoFile) => void
  onClose: () => void
}

export default function WikiView({
  meta,
  selectedFile,
  wikiPages,
  generating,
  onGenerateWiki,
  onClose,
}: Props) {
  if (!selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-on-surface-muted">
        Select a file from the sidebar to view its wiki
      </div>
    )
  }

  return (
    <NodeDetailPanel
      file={selectedFile}
      meta={meta}
      wikiPages={wikiPages}
      generating={generating}
      onGenerateWiki={onGenerateWiki}
      onClose={onClose}
    />
  )
}
