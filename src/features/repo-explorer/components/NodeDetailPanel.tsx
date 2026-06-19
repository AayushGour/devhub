import { useState, useEffect, useRef } from 'react'
import { X, BookOpen, Code2, Loader2 } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { cn } from '@/lib/utils'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'
import type { RepoFile, RepoMeta, WikiPage } from '../types'
import type { useWikiGen } from '../hooks/useWikiGen'

type WikiGenReturn = ReturnType<typeof useWikiGen>

interface Props {
  file: RepoFile | null
  meta: RepoMeta | null
  wikiPages: WikiGenReturn['wikiPages']
  generating: WikiGenReturn['generating']
  onGenerateWiki: (file: RepoFile) => void
  onClose: () => void
}

type Tab = 'wiki' | 'code'

const TAB_CLS = 'px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150'

export default function NodeDetailPanel({
  file,
  meta: _meta,
  wikiPages,
  generating,
  onGenerateWiki,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('wiki')
  const wikiRef = useRef<HTMLDivElement>(null)

  const wikiPage: WikiPage | undefined = file ? wikiPages.get(file.path) : undefined
  const isGenerating = file ? generating.has(file.path) : false

  useEffect(() => {
    if (!wikiRef.current || !wikiPage) return
    wikiRef.current.innerHTML = parseMarkdown(wikiPage.content)
    postProcessPreview(wikiRef.current)
  }, [wikiPage])

  useEffect(() => {
    if (file && tab === 'wiki' && !wikiPage && !isGenerating) {
      onGenerateWiki(file)
    }
  }, [file, tab, wikiPage, isGenerating, onGenerateWiki])

  if (!file) return null

  const monacoLang = file.language.toLowerCase().replace('c++', 'cpp').replace('c#', 'csharp')

  return (
    <div className="w-[28rem] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="flex-1 text-xs text-on-surface truncate font-mono">{file.path}</span>
        <button
          onClick={onClose}
          className="text-on-surface-muted hover:text-on-surface transition-colors duration-150"
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-border shrink-0">
        <button
          onClick={() => setTab('wiki')}
          className={cn(TAB_CLS, tab === 'wiki'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
        >
          <BookOpen size={12} className="inline mr-1.5 -mt-px" />
          Wiki
        </button>
        <button
          onClick={() => setTab('code')}
          className={cn(TAB_CLS, tab === 'code'
            ? 'bg-accent text-accent-text'
            : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-hover')}
        >
          <Code2 size={12} className="inline mr-1.5 -mt-px" />
          Code
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'wiki' ? (
          <div className="p-4">
            {isGenerating ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-muted py-8 justify-center">
                <Loader2 size={14} className="animate-spin" />
                Generating wiki page&hellip;
              </div>
            ) : wikiPage ? (
              <div ref={wikiRef} className="markdown-preview text-sm" />
            ) : (
              <div className="text-sm text-on-surface-muted py-8 text-center">
                <p>No wiki page yet.</p>
                <button
                  onClick={() => onGenerateWiki(file)}
                  className="mt-2 text-accent hover:text-accent-hover text-xs transition-colors duration-150"
                >
                  Generate now
                </button>
              </div>
            )}
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={monacoLang}
            value={file.content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
            }}
            theme="vs-dark"
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border shrink-0 flex items-center justify-between">
        <span className="text-[0.6rem] text-on-surface-muted">
          {file.language} &middot; {(file.sizeBytes / 1024).toFixed(1)} KB
        </span>
        {wikiPage && (
          <span className="text-[0.6rem] text-on-surface-muted">
            Generated {new Date(wikiPage.generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
