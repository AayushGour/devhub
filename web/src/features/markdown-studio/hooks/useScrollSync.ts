import { useCallback, useEffect, useRef } from 'react'
import type { OnMount } from '@monaco-editor/react'

type MonacoEditor = Parameters<OnMount>[0]

/**
 * Bidirectional scroll sync between the Monaco editor and the preview pane.
 *
 * Both sides are mapped by scroll percentage: scrolling one drives the other to
 * the same relative position so the edited region and its rendered output stay
 * aligned side by side. A short-lived `driver` lock prevents the programmatic
 * scroll on the followed side from echoing back and fighting the active side.
 */
export function useScrollSync() {
  const editorRef = useRef<MonacoEditor | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  // Which side initiated the current scroll; the other side ignores its event.
  const driver = useRef<'editor' | 'preview' | null>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const release = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    releaseTimer.current = setTimeout(() => { driver.current = null }, 120)
  }, [])

  const syncFromEditor = useCallback(() => {
    const ed = editorRef.current
    const pv = previewRef.current
    if (!ed || !pv) return
    if (driver.current === 'preview') return
    driver.current = 'editor'

    const edMax = ed.getScrollHeight() - ed.getLayoutInfo().height
    const ratio = edMax > 0 ? ed.getScrollTop() / edMax : 0
    const pvMax = pv.scrollHeight - pv.clientHeight
    pv.scrollTop = ratio * pvMax
    release()
  }, [release])

  const syncFromPreview = useCallback(() => {
    const ed = editorRef.current
    const pv = previewRef.current
    if (!ed || !pv) return
    if (driver.current === 'editor') return
    driver.current = 'preview'

    const pvMax = pv.scrollHeight - pv.clientHeight
    const ratio = pvMax > 0 ? pv.scrollTop / pvMax : 0
    const edMax = ed.getScrollHeight() - ed.getLayoutInfo().height
    ed.setScrollTop(ratio * edMax)
    release()
  }, [release])

  // Attach to the editor on mount; compose with any existing onMount handler.
  const registerEditor = useCallback((editor: MonacoEditor) => {
    editorRef.current = editor
    editor.onDidScrollChange(syncFromEditor)
  }, [syncFromEditor])

  // Attach to the preview's scroll container.
  const previewScrollRef = useCallback((node: HTMLDivElement | null) => {
    if (previewRef.current) previewRef.current.removeEventListener('scroll', syncFromPreview)
    previewRef.current = node
    if (node) node.addEventListener('scroll', syncFromPreview, { passive: true })
  }, [syncFromPreview])

  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    if (previewRef.current) previewRef.current.removeEventListener('scroll', syncFromPreview)
  }, [syncFromPreview])

  return { registerEditor, previewScrollRef }
}
