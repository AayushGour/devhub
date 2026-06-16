import ToolPageLayout from '@/components/layout/ToolPageLayout'
import { FolderPlus } from 'lucide-react'

export default function WorkspacePage() {
  return (
    <ToolPageLayout
      title="Workspace"
      description="Create and manage your projects"
      actions={
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-accent-text text-sm hover:bg-accent-hover transition-colors">
          <FolderPlus size={14} />
          New Workspace
        </button>
      }
    >
      <div className="flex flex-col items-center justify-center h-64 gap-2 border border-dashed border-border rounded-lg">
        <p className="text-on-surface-muted text-sm">No workspaces yet</p>
        <p className="text-xs text-on-surface-muted">Create a workspace to organize your files</p>
      </div>
    </ToolPageLayout>
  )
}
