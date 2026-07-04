import { useEffect, useState } from 'react'
import { getVsCodeApi } from './vscode-api'
import MarkdownView from './views/MarkdownView'
import HtmlView from './views/HtmlView'
import DiagramView from './views/DiagramView'
import JsonView from './views/JsonView'
import SvgView from './views/SvgView'
import TokenView from './views/TokenView'
import YamlView from './views/YamlView'
import XmlView from './views/XmlView'
import TomlView from './views/TomlView'

export interface HistoryEntry {
  fileName: string
  relativePath: string
}

interface UpdateMessage {
  type: 'update'
  tool: string
  text: string
  languageId: string
  format?: 'jsonl'
  colorTheme?: 'light' | 'dark'
  history: HistoryEntry[]
  historyIndex: number
}

/**
 * Side-preview shell. Holds the document text pushed from the extension host and
 * renders the matching DevHub preview component.
 *
 * `tool` is initialised from the bootstrap data but becomes stateful so that
 * in-preview link navigation can switch between file types (e.g. HTML → Markdown).
 */
export default function PreviewHost({ tool: initialTool }: { tool: string }) {
  const [tool, setTool] = useState(initialTool)
  const [text, setText] = useState('')
  const [format, setFormat] = useState<'jsonl' | undefined>(undefined)
  const [colorTheme, setColorTheme] = useState<'light' | 'dark'>(
    window.__DEVHUB__?.colorTheme ?? 'dark',
  )
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)

  useEffect(() => {
    const vscode = getVsCodeApi()
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as UpdateMessage | undefined
      if (msg?.type !== 'update') return
      if (msg.tool) setTool(msg.tool)
      setText(msg.text ?? '')
      setFormat(msg.format)
      setHistory(msg.history ?? [])
      setHistoryIndex(msg.historyIndex ?? 0)
      if (msg.colorTheme) {
        setColorTheme(msg.colorTheme)
        document.documentElement.setAttribute('data-theme', msg.colorTheme)
      }
    }
    window.addEventListener('message', onMessage)
    // Tell the host we are mounted and ready for the initial content.
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="studio-root">
      {renderTool(tool, text, colorTheme, history, historyIndex, format)}
    </div>
  )
}

function renderTool(
  tool: string,
  text: string,
  colorTheme: 'light' | 'dark',
  history: HistoryEntry[],
  historyIndex: number,
  format?: 'jsonl',
) {
  switch (tool) {
    case 'markdown':
      return (
        <MarkdownView
          text={text}
          colorTheme={colorTheme}
          history={history}
          historyIndex={historyIndex}
        />
      )
    case 'html':
      return <HtmlView text={text} history={history} historyIndex={historyIndex} />
    case 'diagram':
      return <DiagramView text={text} colorTheme={colorTheme} />
    case 'json':
      return <JsonView text={text} format={format} />
    case 'svg':
      return <SvgView text={text} />
    case 'token':
      return <TokenView text={text} />
    case 'yaml':
      return <YamlView text={text} />
    case 'xml':
      return <XmlView text={text} />
    case 'toml':
      return <TomlView text={text} />
    default:
      return <div className="p-4 text-sm text-on-surface-muted">Unsupported preview: {tool}</div>
  }
}
