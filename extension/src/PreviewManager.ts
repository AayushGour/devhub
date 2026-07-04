import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { getWebviewHtml, colorThemeName } from './html'
import { inlineAssets, injectNavInterceptor } from './htmlPreprocess'

type Tool = 'markdown' | 'html' | 'diagram' | 'json' | 'svg' | 'token' | 'yaml' | 'xml' | 'toml'

interface Preview {
  panel: vscode.WebviewPanel
  docUri: vscode.Uri
  tool: Tool
  /** Current map key — updated on in-place navigation so dispose deletes the right entry. */
  key: string
  /** Navigation sandbox: resolved once at open time, never widened. */
  boundary: string
  disposables: vscode.Disposable[]
}

const DEBOUNCE_MS = 200

/** Maps an editor's language/filename to a DevHub preview tool. */
function toolForDocument(doc: vscode.TextDocument): Tool | undefined {
  const lang = doc.languageId
  const name = doc.fileName.toLowerCase()
  // Markdown — also .mdc (markdown + frontmatter).
  if (lang === 'markdown' || name.endsWith('.mdc')) return 'markdown'
  // HTML — rendered in a sandboxed iframe.
  if (lang === 'html' || name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  if (lang === 'mermaid' || name.endsWith('.mmd') || name.endsWith('.mermaid')) return 'diagram'
  if (lang === 'json' || lang === 'jsonc') return 'json'
  // JSON Lines / NDJSON — each line is its own JSON value.
  if (lang === 'jsonl' || name.endsWith('.jsonl') || name.endsWith('.ndjson')) return 'json'
  if (lang === 'svg') return 'svg'
  if (lang === 'xml' && name.endsWith('.svg')) return 'svg'
  if (lang === 'yaml' || name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
  if (lang === 'xml' || name.endsWith('.xml')) return 'xml'
  if (lang === 'toml' || name.endsWith('.toml')) return 'toml'
  return undefined
}

/** Maps a file path to a DevHub preview tool (for navigation where no TextDocument exists). */
function toolForPath(fsPath: string): Tool | undefined {
  const name = fsPath.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.mdc')) return 'markdown'
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  if (name.endsWith('.mmd') || name.endsWith('.mermaid')) return 'diagram'
  if (name.endsWith('.jsonl') || name.endsWith('.ndjson')) return 'json'
  if (name.endsWith('.json') || name.endsWith('.jsonc')) return 'json'
  if (name.endsWith('.svg')) return 'svg'
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
  if (name.endsWith('.xml')) return 'xml'
  if (name.endsWith('.toml')) return 'toml'
  return undefined
}

/** Extra format hint passed to the webview so it can adapt parsing (e.g. JSONL). */
function previewFormat(doc: vscode.TextDocument): 'jsonl' | undefined {
  const name = doc.fileName.toLowerCase()
  if (doc.languageId === 'jsonl' || name.endsWith('.jsonl') || name.endsWith('.ndjson')) {
    return 'jsonl'
  }
  return undefined
}

/** Derive format from path alone (used when no TextDocument is open after navigation). */
function formatForPath(fsPath: string): 'jsonl' | undefined {
  const name = fsPath.toLowerCase()
  return name.endsWith('.jsonl') || name.endsWith('.ndjson') ? 'jsonl' : undefined
}

/**
 * Owns the side-preview webviews. Each is locked to its source document (like
 * the built-in Markdown preview) and re-rendered, debounced, on edits.
 */
export class PreviewManager {
  private readonly previews = new Map<string, Preview>()

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Opens (or reveals) a preview for the active editor. `force` ignores language detection. */
  openForActiveEditor(force?: Tool): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showInformationMessage('DevHub: open a file first, then run this command.')
      return
    }
    const doc = editor.document
    const tool = force ?? toolForDocument(doc)
    if (!tool) {
      vscode.window.showInformationMessage(
        'DevHub: no preview for this file type (supported: Markdown, Mermaid, JSON, SVG).',
      )
      return
    }

    const key = `${tool}:${doc.uri.toString()}`
    const existing = this.previews.get(key)
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'devhub.preview',
      previewTitle(tool, doc),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      },
    )

    // Sandbox boundary: workspace folder root, or the file's own directory if
    // no workspace is open. Stored once and never widened by navigation.
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
    const boundary = wsFolder?.uri.fsPath ?? path.dirname(doc.uri.fsPath)

    const preview: Preview = { panel, docUri: doc.uri, tool, key, boundary, disposables: [] }
    this.previews.set(key, preview)

    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri, {
      view: 'preview',
      tool,
      colorTheme: colorThemeName(),
    })

    const post = () => {
      const d = findDoc(preview.docUri)
      let text = d?.getText() ?? ''
      // Only fall back to disk read when the document is NOT open in VS Code
      // (d === undefined). An open-but-empty file must not trigger a re-read.
      if (d === undefined) {
        try { text = fs.readFileSync(preview.docUri.fsPath, 'utf8') } catch { text = '' }
      }
      const currentTool = preview.tool
      if (currentTool === 'html') {
        text = inlineAssets(text, path.dirname(preview.docUri.fsPath))
        text = injectNavInterceptor(text)
      }
      panel.webview.postMessage({
        type: 'update',
        tool: currentTool,
        format: d ? previewFormat(d) : formatForPath(preview.docUri.fsPath),
        text,
        languageId: d?.languageId ?? '',
        colorTheme: colorThemeName(),
      })
    }

    // Webview asks for content once it has mounted.
    preview.disposables.push(
      panel.webview.onDidReceiveMessage((msg) => {
        if (msg?.type === 'ready') post()

        if (msg?.type === 'navigate') {
          const href = msg.href as string

          // http/https links in navigate messages should never reach here —
          // the iframe interceptor sends them as 'openExternal' — but guard anyway.
          if (href.match(/^https?:/)) {
            vscode.env.openExternal(vscode.Uri.parse(href))
            return
          }

          // Strip fragment and query string before resolving to an on-disk path.
          const hrefPath = href.split('?')[0].split('#')[0]
          if (!hrefPath) return

          const currentDir = path.dirname(preview.docUri.fsPath)
          const newFsPath = path.resolve(currentDir, hrefPath)

          // Prevent path traversal outside the initial workspace/project boundary.
          const rel = path.relative(preview.boundary, newFsPath)
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            vscode.window.showErrorMessage(
              `DevHub: navigation outside the workspace is not allowed (${path.basename(newFsPath)})`,
            )
            return
          }

          const newTool = toolForPath(newFsPath)
          if (!newTool) {
            vscode.window.showErrorMessage(`DevHub: no preview for ${path.basename(newFsPath)}`)
            return
          }

          // Verify the file is readable before mutating state — prevents a blank
          // panel if the link target doesn't exist.
          try {
            fs.accessSync(newFsPath, fs.constants.R_OK)
          } catch {
            vscode.window.showErrorMessage(`DevHub: cannot open ${path.basename(newFsPath)}`)
            return
          }

          // All checks passed — commit the navigation.
          this.previews.delete(preview.key)
          const newKey = `${newTool}:${vscode.Uri.file(newFsPath).toString()}`
          preview.key = newKey
          preview.docUri = vscode.Uri.file(newFsPath)
          preview.tool = newTool
          this.previews.set(newKey, preview)

          const basename = path.basename(newFsPath)
          const label = newTool === 'html' ? 'HTML' : newTool[0].toUpperCase() + newTool.slice(1)
          panel.title = `${label}: ${basename}`
          post()
        }

        if (msg?.type === 'openExternal') {
          const href = msg.href as string
          // Only open http/https URIs — block file:, javascript:, vscode:, etc.
          if (!href.match(/^https?:/i)) {
            vscode.window.showErrorMessage(`DevHub: blocked unsafe external URL scheme`)
            return
          }
          vscode.env.openExternal(vscode.Uri.parse(href))
        }

        if (msg?.type === 'exportPDF') {
          const html = msg.html as string
          const filename = (msg.filename as string | undefined) ?? 'document'
          const tmpPath = path.join(os.tmpdir(), `devhub-${filename}-${Date.now()}.html`)
          // Inject auto-print + auto-close so the browser shows the print
          // dialog immediately on load, then closes the tab when done.
          const printableHtml = html.replace(
            '</body>',
            `<script>
window.addEventListener('load', function () {
  document.fonts.ready.then(function () {
    setTimeout(window.print, 300);
  });
});
window.addEventListener('afterprint', function () {
  window.close();
});
</script>
</body>`,
          )
          try {
            fs.writeFileSync(tmpPath, printableHtml, 'utf8')
            vscode.env.openExternal(vscode.Uri.file(tmpPath))
          } catch (err) {
            vscode.window.showErrorMessage(`DevHub: export failed — ${err}`)
          }
        }

        if (msg?.type === 'exportHTML') {
          const html = msg.html as string
          const filename = (msg.filename as string | undefined) ?? 'document'
          const tmpPath = path.join(os.tmpdir(), `devhub-${filename}-${Date.now()}.html`)
          try {
            fs.writeFileSync(tmpPath, html, 'utf8')
            vscode.env.openExternal(vscode.Uri.file(tmpPath))
          } catch (err) {
            vscode.window.showErrorMessage(`DevHub: HTML export failed — ${err}`)
          }
        }
      }),
    )

    // Debounced re-render on edits to the bound document.
    let timer: ReturnType<typeof setTimeout> | undefined
    preview.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== preview.docUri.toString()) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(post, DEBOUNCE_MS)
      }),
    )

    // Track editor theme so the preview matches light/dark.
    preview.disposables.push(vscode.window.onDidChangeActiveColorTheme(post))

    // Use preview.key (not the original const) so navigation that updated the
    // key doesn't leave a ghost entry in the map.
    panel.onDidDispose(() => {
      if (timer) clearTimeout(timer)
      preview.disposables.forEach((d) => d.dispose())
      this.previews.delete(preview.key)
    })
  }
}

function findDoc(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())
}

function previewTitle(tool: Tool, doc: vscode.TextDocument): string {
  const name = doc.fileName.split(/[\\/]/).pop() ?? 'Untitled'
  const label =
    tool === 'token' ? 'Tokens' : tool === 'html' ? 'HTML' : tool[0].toUpperCase() + tool.slice(1)
  return `${label}: ${name}`
}
