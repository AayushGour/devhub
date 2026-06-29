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

interface UpdateMessage {
  type: 'update'
  tool: string
  text: string
  languageId: string
  format?: 'jsonl'
  colorTheme?: 'light' | 'dark'
}

/**
 * Side-preview shell. Holds the document text pushed from the extension host and
 * renders the matching DevHub preview component.
 */
export default function PreviewHost({ tool }: { tool: string }) {
  const [text, setText] = useState('')
  const [format, setFormat] = useState<'jsonl' | undefined>(undefined)
  const [colorTheme, setColorTheme] = useState<'light' | 'dark'>(
    window.__DEVHUB__?.colorTheme ?? 'dark',
  )

  useEffect(() => {
    const vscode = getVsCodeApi()
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as UpdateMessage | undefined
      if (msg?.type !== 'update') return
      setText(msg.text ?? '')
      setFormat(msg.format)
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

  return <div className="studio-root">{renderTool(tool, text, colorTheme, format)}</div>
}

function renderTool(
  tool: string,
  text: string,
  colorTheme: 'light' | 'dark',
  format?: 'jsonl',
) {
  switch (tool) {
    case 'markdown':
      return <MarkdownView text={text} colorTheme={colorTheme} />
    case 'html':
      return <HtmlView text={text} />
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
    default:
      return <div className="p-4 text-sm text-on-surface-muted">Unsupported preview: {tool}</div>
  }
}
