import { useState } from 'react'
import { ChevronRight, ChevronDown, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectLanguage } from '../utils/languageDetect'
import type { RepoFile } from '../types'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
  file?: RepoFile
}

function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    let cumPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cumPath = cumPath ? `${cumPath}/${part}` : part
      const isLast = i === parts.length - 1

      let node = current.find((n) => n.name === part)
      if (!node) {
        node = {
          name: part,
          path: cumPath,
          type: isLast ? 'file' : 'dir',
          children: isLast ? undefined : [],
          file: isLast ? file : undefined,
        }
        current.push(node)
      }
      if (!isLast) current = node.children!
    }
  }

  return sortTree(root)
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => ({ ...n, children: n.children ? sortTree(n.children) : undefined }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

interface TreeNodeProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (file: RepoFile) => void
}

function TreeItem({ node, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2)
  const isSelected = node.path === selectedPath
  const lang = node.type === 'file' ? detectLanguage(node.path) : null

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-on-surface-muted',
            'hover:text-on-surface hover:bg-surface-hover transition-colors duration-150 rounded',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span className="font-medium">{node.name}/</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => node.file && onSelect(node.file)}
      className={cn(
        'w-full flex items-center gap-1.5 py-0.5 text-xs transition-colors duration-150 rounded',
        isSelected
          ? 'bg-accent/10 text-accent'
          : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover',
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {lang ? (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lang.color }} />
      ) : (
        <File size={11} />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface Props {
  files: RepoFile[]
  selectedPath: string | null
  onSelect: (file: RepoFile) => void
}

export default function RepoSidebar({ files, selectedPath, onSelect }: Props) {
  const tree = buildTree(files)

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-surface overflow-y-auto">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-[0.65rem] font-semibold text-on-surface-muted uppercase tracking-widest">
          Files ({files.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  )
}
