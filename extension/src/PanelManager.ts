import * as vscode from 'vscode'
import { getWebviewHtml, colorThemeName } from './html'

type PanelTool = 'crypto' | 'image'

/**
 * Owns the standalone, interactive tool panels (Crypto, Image). These are
 * self-contained DevHub pages with no source document — one singleton panel
 * per tool, revealed if already open.
 */
export class PanelManager {
  private readonly panels = new Map<PanelTool, vscode.WebviewPanel>()

  constructor(private readonly context: vscode.ExtensionContext) {}

  open(tool: PanelTool, title: string): void {
    const existing = this.panels.get(tool)
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      `devhub.panel.${tool}`,
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      },
    )
    this.panels.set(tool, panel)

    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri, {
      view: 'panel',
      tool,
      colorTheme: colorThemeName(),
    })

    const themeSub = vscode.window.onDidChangeActiveColorTheme(() =>
      panel.webview.postMessage({ type: 'theme', colorTheme: colorThemeName() }),
    )

    panel.onDidDispose(() => {
      themeSub.dispose()
      this.panels.delete(tool)
    })
  }
}
