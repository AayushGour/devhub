/**
 * Renders the document's HTML in a sandboxed iframe via `srcdoc`. The HTML
 * preview panel is served a permissive CSP, so the page's own CSS, scripts and
 * external assets run — a live preview of the file as a browser would show it.
 */
export default function HtmlView({ text }: { text: string }) {
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
