import { useEffect } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getVsCodeApi } from '../vscode-api'
import HistoryMenuItems from './HistoryMenuItems'
import type { HistoryEntry } from '../PreviewHost'

const ICON_BTN_CLS =
  'p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * Renders the document's HTML in a sandboxed iframe via `srcdoc`. The HTML
 * preview panel is served a permissive CSP, so the page's own CSS, scripts and
 * external assets run — a live preview of the file as a browser would show it.
 *
 * Link interception: the extension host injects a nav-interceptor script into
 * the HTML that posts `devhub-navigate` / `devhub-external` messages to this
 * parent window. We relay them to the extension host via vscode.postMessage so
 * it can load the target file and push an `update` message back.
 */
export default function HtmlView({
  text,
  history,
  historyIndex,
}: {
  text: string
  history: HistoryEntry[]
  historyIndex: number
}) {
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const jump = (index: number) => getVsCodeApi().postMessage({ type: 'historyJump', index })

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; href?: string } | undefined
      if (!data?.type || !data.href) return
      if (data.type === 'devhub-navigate') {
        getVsCodeApi().postMessage({ type: 'navigate', href: data.href })
      } else if (data.type === 'devhub-external') {
        getVsCodeApi().postMessage({ type: 'openExternal', href: data.href })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-0.5">
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <button
                data-tooltip="Back"
                disabled={!canGoBack}
                onClick={() => jump(historyIndex - 1)}
                className={ICON_BTN_CLS}
              >
                <ArrowLeft size={14} />
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <HistoryMenuItems history={history} historyIndex={historyIndex} direction="back" onJump={jump} />
            </ContextMenu.Portal>
          </ContextMenu.Root>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <button
                data-tooltip="Forward"
                disabled={!canGoForward}
                onClick={() => jump(historyIndex + 1)}
                className={ICON_BTN_CLS}
              >
                <ArrowRight size={14} />
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <HistoryMenuItems history={history} historyIndex={historyIndex} direction="forward" onJump={jump} />
            </ContextMenu.Portal>
          </ContextMenu.Root>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 bg-white">
        <iframe
          title="HTML preview"
          srcDoc={text}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          className="flex-1 min-w-0 border-0 bg-white"
        />
      </div>
    </div>
  )
}
