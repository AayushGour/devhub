import { useEffect } from 'react'
import { getVsCodeApi } from '../vscode-api'

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
export default function HtmlView({ text }: { text: string }) {
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
    <div className="flex flex-1 min-h-0 bg-white">
      <iframe
        title="HTML preview"
        srcDoc={text}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        className="flex-1 min-w-0 border-0 bg-white"
      />
    </div>
  )
}
