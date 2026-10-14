import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import XmlView from './XmlView'

// Bundled with the extension (webview/public/vendor/drawio -> media/vendor/drawio);
// resolved against the webview's <base href>. Nothing is fetched from diagrams.net.
const VENDOR_BASE = new URL('./vendor/drawio/', document.baseURI).href
const VIEWER_SRC = `${VENDOR_BASE}viewer-static.min.js`
const LOAD_TIMEOUT_MS = 10_000

// Minimal local typing for the (untyped) draw.io viewer global. On a viewer instance
// `currentPage` is the integer page index (set in selectPage over `this.diagrams`;
// verified by reading viewer-static.min.js). It is undocumented, hence optional.
interface GraphViewerInstance {
  currentPage?: number
}
interface GraphViewerApi {
  createViewerForElement(el: Element, callback?: (viewer: GraphViewerInstance) => void): void
}

declare global {
  interface Window {
    GraphViewer?: GraphViewerApi
  }
}

const PANE_CLS = 'drawio-viewer flex-1 min-h-0 overflow-auto bg-surface'

let viewerPromise: Promise<GraphViewerApi> | null = null

function loadViewer(): Promise<GraphViewerApi> {
  if (viewerPromise) return viewerPromise
  const p = new Promise<GraphViewerApi>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const fail = (message: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      script.remove() // so a retry appends a fresh tag
      reject(new Error(message))
    }
    const timer = window.setTimeout(() => fail('Timed out loading the draw.io viewer'), LOAD_TIMEOUT_MS)
    // The viewer reads these globals (falling back to viewer.diagrams.net) when it loads.
    Object.assign(window, {
      STYLE_PATH: `${VENDOR_BASE}styles`,
      SHAPES_PATH: `${VENDOR_BASE}shapes`,
      STENCIL_PATH: `${VENDOR_BASE}stencils`,
    })
    script.src = VIEWER_SRC
    script.async = true
    script.onload = () => {
      if (settled) return
      if (!window.GraphViewer) return fail('draw.io viewer loaded but GraphViewer is missing')
      settled = true
      window.clearTimeout(timer)
      resolve(window.GraphViewer)
    }
    script.onerror = () => fail('Failed to load the draw.io viewer')
    document.head.appendChild(script)
  })
  viewerPromise = p
  // Reset the cache on failure so a later update can retry.
  p.catch(() => {
    if (viewerPromise === p) viewerPromise = null
  })
  return p
}

function currentPageIndex(viewer: GraphViewerInstance | null): number {
  return typeof viewer?.currentPage === 'number' ? viewer.currentPage : 0
}

export default function DrawioView({
  text,
  colorTheme,
}: {
  text: string
  colorTheme: 'light' | 'dark'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<GraphViewerInstance | null>(null)
  const pageRef = useRef(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    loadViewer()
      .then((api) => {
        if (cancelled) return
        setLoadFailed(false)
        container.replaceChildren()
        if (!text.trim()) {
          setRenderError(null)
          return
        }
        const el = document.createElement('div')
        el.className = 'mxgraph'
        el.setAttribute(
          'data-mxgraph',
          JSON.stringify({
            xml: text,
            highlight: '#0000ff',
            nav: true,
            toolbar: 'pages zoom layers',
            lightbox: false,
            resize: true,
            page: pageRef.current,
            // Viewer accepts 'dark' | 'auto' | anything else = light (not 'true'/'false').
            'dark-mode': colorTheme === 'dark' ? 'dark' : 'light',
          }),
        )
        container.appendChild(el)
        try {
          api.createViewerForElement(el, (viewer) => {
            if (cancelled) return
            viewerRef.current = viewer
          })
          setRenderError(null)
        } catch (err) {
          setRenderError(err instanceof Error ? err.message : String(err))
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => {
      cancelled = true
      // Remember the visible page, then drop the old viewer's DOM so nothing is duplicated.
      if (viewerRef.current) pageRef.current = currentPageIndex(viewerRef.current)
      viewerRef.current = null
      container.replaceChildren()
    }
  }, [text, colorTheme])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {loadFailed && (
        <div className="drawio-offline shrink-0 p-3 border-b border-border">
          <p className="text-[0.75rem] text-on-surface-muted">
            draw.io viewer failed to load — showing the raw XML instead
          </p>
        </div>
      )}
      {renderError && !loadFailed && (
        <div className="drawio-error shrink-0 p-3 border-b border-border">
          <pre className="text-[0.75rem] text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 whitespace-pre-wrap font-mono">{renderError}</pre>
        </div>
      )}
      <div ref={containerRef} className={cn(PANE_CLS, loadFailed && 'hidden')} />
      {loadFailed && (
        <div className="flex flex-1 min-h-0">
          <XmlView text={text} />
        </div>
      )}
    </div>
  )
}
