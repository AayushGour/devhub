import { useEffect, useState } from 'react'
import SvgPreviewPanel from '@/features/svg-studio/components/SvgPreviewPanel'
import { exportPDFViaHost } from '../utils/print'
import { FileImage, Printer } from 'lucide-react'

const SELECT_CLS =
  'bg-surface-raised border border-border rounded-md px-2 py-1 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'

const TOOL_BTN_CLS =
  'p-1.5 rounded-md text-on-surface-muted hover:bg-surface-hover hover:text-on-surface transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'

const FALLBACK_ENGINES = ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage']

type Viz = Awaited<ReturnType<typeof import('@viz-js/viz').instance>>

let enginesCache: string[] = []
let vizPromise: Promise<Viz> | null = null

function loadViz(): Promise<Viz> {
  if (!vizPromise) {
    vizPromise = import('@viz-js/viz').then((m) => m.instance())
      .then((viz) => {
        enginesCache = viz.engines.filter((e) => !/^nop[12]?$/.test(e))
        return viz
      })
    // Allow a retry if loading failed.
    vizPromise.catch(() => {
      vizPromise = null
    })
  }
  return vizPromise
}

function downloadSvg(svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'graph.svg'
  a.click()
  URL.revokeObjectURL(url)
}

export default function DotView({ text }: { text: string }) {
  const [engine, setEngine] = useState('dot')
  const [engines, setEngines] = useState<string[]>(FALLBACK_ENGINES)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadViz()
      .then((viz) => {
        if (cancelled) return
        if (enginesCache.length) setEngines((prev) => (prev === enginesCache ? prev : enginesCache))
        if (!text.trim()) {
          setSvg('')
          setError(null)
          return
        }
        const result = viz.render(text, { format: 'svg', engine })
        if (result.status === 'success') {
          setSvg(result.output)
          setError(null)
        } else {
          setError(result.errors.map((e) => e.message).join('\n') || 'Failed to render graph')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [text, engine])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">
          Engine
        </span>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} className={SELECT_CLS}>
          {engines.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            data-tooltip="Export SVG"
            disabled={!svg}
            onClick={() => downloadSvg(svg)}
            className={TOOL_BTN_CLS}
          >
            <FileImage size={14} />
          </button>
          <button
            data-tooltip="Export PDF"
            disabled={!svg}
            onClick={() => exportPDFViaHost(
              `<!DOCTYPE html><html><head><title>Graph</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{display:flex;justify-content:center;padding:20mm;}@page{margin:20mm;}svg{max-width:100%;height:auto;}</style></head><body>${svg}</body></html>`,
              'graph',
            )}
            className={TOOL_BTN_CLS}
          >
            <Printer size={14} />
          </button>
        </div>
      </div>
      {error && (
        <div className="dot-error shrink-0 p-3 border-b border-border">
          <p className="text-[0.69rem] font-semibold uppercase tracking-[0.06em] text-red-500 mb-2">
            Graphviz error
          </p>
          <pre className="text-[0.75rem] text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed">
            {error}
          </pre>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <SvgPreviewPanel svg={svg} showHeader={false} />
      </div>
    </div>
  )
}
