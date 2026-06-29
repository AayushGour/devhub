import { useEffect, useRef } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { useSettingsStore } from '@/store/settingsStore'
import type { JsonStudioState } from '../../hooks/useJsonStudio'
import './DiffMode.css'

type Props = Pick<JsonStudioState, 'diffLeft' | 'setDiffLeft' | 'diffRight' | 'setDiffRight'>

const DARK_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

export default function DiffMode({ diffLeft, setDiffLeft, diffRight, setDiffRight }: Props) {
  const { theme: appTheme } = useSettingsStore()
  const isDark = DARK_THEMES.has(appTheme)

  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)

  // Create MergeView once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const themeExt = isDark ? oneDark : []
    const sharedExt = [basicSetup, json(), themeExt]

    const mv = new MergeView({
      a: {
        doc: diffLeft,
        extensions: [
          ...sharedExt,
          EditorView.updateListener.of(u => {
            if (u.docChanged) setDiffLeft(u.state.doc.toString())
          }),
        ],
      },
      b: {
        doc: diffRight,
        extensions: [
          ...sharedExt,
          EditorView.updateListener.of(u => {
            if (u.docChanged) setDiffRight(u.state.doc.toString())
          }),
        ],
      },
      parent: containerRef.current,
      highlightChanges: true,
      gutter: true,
    })

    mergeViewRef.current = mv

    return () => {
      mv.destroy()
      mergeViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]) // recreate on theme switch only

  // Sync external changes (format/clear) into the editors
  useEffect(() => {
    const mv = mergeViewRef.current
    if (!mv) return
    const cur = mv.a.state.doc.toString()
    if (cur !== diffLeft) {
      mv.a.dispatch({ changes: { from: 0, to: cur.length, insert: diffLeft } })
    }
  }, [diffLeft])

  useEffect(() => {
    const mv = mergeViewRef.current
    if (!mv) return
    const cur = mv.b.state.doc.toString()
    if (cur !== diffRight) {
      mv.b.dispatch({ changes: { from: 0, to: cur.length, insert: diffRight } })
    }
  }, [diffRight])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="diff-mode-header shrink-0 flex items-center border-b border-border text-xs font-medium text-on-surface-muted select-none">
        <div className="flex-1 px-3 py-[0.38rem]">Before</div>
        <div className="flex-1 px-3 py-[0.38rem] border-l border-border">After</div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" ref={containerRef} />
    </div>
  )
}
