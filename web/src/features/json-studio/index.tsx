import { useMemo, useState, useCallback } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import CollapsiblePanel from '@/components/ui/CollapsiblePanel'
import { useJsonStudio } from './hooks/useJsonStudio'
import JsonToolbar from './components/JsonToolbar'
import JsonEditor from './components/JsonEditor'
import FilePanel from './components/FilePanel'
import TreeMode from './components/modes/TreeMode'
import GraphMode from './components/modes/GraphMode'
import DiffMode from './components/modes/DiffMode'
import JsonPathMode from './components/modes/JsonPathMode'
import SchemaMode from './components/modes/SchemaMode'
import TypesMode from './components/modes/TypesMode'

function jsonDepth(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  const children = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)
  if (children.length === 0) return 1
  return 1 + Math.max(...children.map(jsonDepth))
}

function jsonKeyCount(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  if (Array.isArray(v)) return v.reduce((acc, c) => acc + jsonKeyCount(c), 0)
  const obj = v as Record<string, unknown>
  return Object.keys(obj).length + Object.values(obj).reduce<number>((acc, c) => acc + jsonKeyCount(c), 0)
}

const SHARED_EDITOR_WIDTH = '45%'

export default function JsonStudioPage() {
  const state = useJsonStudio()
  const [filesOpen, setFilesOpen] = useState(false)
  const [editorCollapsed, setEditorCollapsed] = useState(false)

  const isDiff = state.mode === 'diff'

  // Reveal the Files panel on upload so the user sees their files.
  const handleUploadFiles = useCallback((uploaded: { name: string; content: string }[]) => {
    state.loadFiles(uploaded)
    setFilesOpen(true)
  }, [state])

  const footerStats = useMemo(() => {
    const trimmed = state.input.trim()
    if (!trimmed) return null
    try {
      const value = JSON.parse(state.input)
      const lines = state.input.split('\n').length
      const bytes = new TextEncoder().encode(state.input).length
      return {
        valid: true,
        error: null as string | null,
        lines,
        bytes,
        keys: jsonKeyCount(value),
        depth: jsonDepth(value),
      }
    } catch (e) {
      return { valid: false, error: (e as Error).message, lines: 0, bytes: 0, keys: 0, depth: 0 }
    }
  }, [state.input])

  return (
    <div className="studio-root">
      <JsonToolbar
        title={state.title}
        setTitle={state.setTitle}
        mode={state.mode}
        setMode={state.setMode}
        filesOpen={filesOpen}
        onToggleFiles={() => setFilesOpen(o => !o)}
        onUploadFiles={handleUploadFiles}
      />

      <div className="flex flex-1 min-h-0">
        {/* Shared left editor — hidden for diff which owns its own layout */}
        {!isDiff && (
          <CollapsiblePanel
            collapsed={editorCollapsed}
            onToggle={() => setEditorCollapsed(v => !v)}
            width={SHARED_EDITOR_WIDTH}
            bordered={false}
            labelExpand="Show editor"
            labelCollapse="Hide editor"
          >
            <div className="flex-1 min-h-0 flex">
              <JsonEditor
                value={state.input}
                onChange={state.setInput}
                width="100%"
                toolbar
              />
            </div>
          </CollapsiblePanel>
        )}

        {/* Right panel — switches per mode */}
        {state.mode === 'tree' && (
          <TreeMode input={state.input} />
        )}
        {state.mode === 'graph' && (
          <GraphMode input={state.input} />
        )}
        {isDiff && (
          <DiffMode
            diffLeft={state.diffLeft}
            setDiffLeft={state.setDiffLeft}
            diffRight={state.diffRight}
            setDiffRight={state.setDiffRight}
          />
        )}
        {state.mode === 'jsonpath' && (
          <JsonPathMode
            input={state.input}
            setInput={state.setInput}
            jsonPathQuery={state.jsonPathQuery}
            setJsonPathQuery={state.setJsonPathQuery}
          />
        )}
        {state.mode === 'schema' && (
          <SchemaMode input={state.input} setInput={state.setInput} />
        )}
        {state.mode === 'types' && (
          <TypesMode
            input={state.input}
            setInput={state.setInput}
            typeLang={state.typeLang}
            setTypeLang={state.setTypeLang}
            rootName={state.rootName}
            setRootName={state.setRootName}
          />
        )}

        {filesOpen && (
          <FilePanel
            files={state.files}
            activeId={state.activeId}
            onSelectFile={state.selectFile}
            onRenameFile={state.renameFile}
            onRemoveFile={state.removeFile}
            onNewFile={state.newFile}
          />
        )}
      </div>

      {/* Persistent footer */}
      <div className="shrink-0 border-t border-border bg-surface h-9 flex items-center px-4 gap-4">
        {!footerStats && (
          <span className="text-[0.69rem] text-on-surface-muted">No input</span>
        )}
        {footerStats && (
          <>
            <span className={cn(
              'flex items-center gap-1.5 text-[0.69rem] font-medium',
              footerStats.valid ? 'text-emerald-600' : 'text-red-500'
            )}>
              {footerStats.valid
                ? <CheckCircle size={12} />
                : <XCircle size={12} />
              }
              {footerStats.valid ? 'Valid JSON' : 'Invalid JSON'}
            </span>

            {!footerStats.valid && footerStats.error && (
              <span className="text-[0.69rem] text-red-400 font-mono truncate max-w-[20rem]">
                {footerStats.error}
              </span>
            )}

            {footerStats.valid && (
              <>
                <div className="w-px h-3.5 bg-border" />
                {[
                  { label: 'lines', value: footerStats.lines },
                  { label: 'bytes', value: footerStats.bytes > 1024 ? `${(footerStats.bytes / 1024).toFixed(1)} KB` : `${footerStats.bytes} B` },
                  { label: 'keys', value: footerStats.keys },
                  { label: 'depth', value: footerStats.depth },
                ].map(s => (
                  <span key={s.label} className="flex items-baseline gap-1 text-[0.69rem]">
                    <span className="font-semibold tabular-nums text-on-surface">{s.value}</span>
                    <span className="text-on-surface-muted">{s.label}</span>
                  </span>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
