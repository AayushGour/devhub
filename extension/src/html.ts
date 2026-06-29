import * as vscode from 'vscode'
import * as fs from 'node:fs'

export type DevHubView = 'preview' | 'panel'

export interface WebviewBootstrap {
  view: DevHubView
  tool: string
  colorTheme: 'light' | 'dark'
}

export function colorThemeName(): 'light' | 'dark' {
  const kind = vscode.window.activeColorTheme.kind
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? 'light'
    : 'dark'
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
  return s
}

/**
 * Reads the Vite-built media/index.html and rewrites it for the webview:
 * a <base href> so Vite's relative ./assets/* resolve to webview resource URIs,
 * a CSP meta, and a nonce'd bootstrap script carrying the view/tool/theme.
 */
export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  boot: WebviewBootstrap,
): string {
  const mediaUri = vscode.Uri.joinPath(extensionUri, 'media')
  const indexPath = vscode.Uri.joinPath(mediaUri, 'index.html').fsPath

  let html: string
  try {
    html = fs.readFileSync(indexPath, 'utf8')
  } catch {
    return fallbackHtml()
  }

  const baseHref = webview.asWebviewUri(mediaUri).toString().replace(/\/?$/, '/')
  const n = nonce()
  const cs = webview.cspSource
  // The HTML preview renders the user's own file in a sandboxed iframe and must be
  // able to run that page's CSS/JS/assets, so it gets a permissive policy. All other
  // previews keep a strict, nonce-based policy.
  const csp = (
    boot.tool === 'html'
      ? [
          `default-src 'none'`,
          `img-src ${cs} * data: blob:`,
          `font-src ${cs} * data:`,
          `style-src ${cs} 'unsafe-inline' *`,
          `script-src ${cs} 'unsafe-inline' 'unsafe-eval' * blob: data:`,
          `worker-src ${cs} * blob:`,
          `connect-src ${cs} * data: blob:`,
          `frame-src ${cs} * blob: data:`,
        ]
      : [
          `default-src 'none'`,
          `img-src ${cs} data: blob: https:`,
          `font-src ${cs} data: https:`,
          `style-src ${cs} 'unsafe-inline' https:`,
          `script-src ${cs} 'wasm-unsafe-eval' 'nonce-${n}'`,
          `worker-src ${cs} blob:`,
          `connect-src ${cs} blob: data: https:`,
        ]
  ).join('; ')

  const injected = [
    `<base href="${baseHref}">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<script nonce="${n}">window.__DEVHUB__=${JSON.stringify(boot)};</script>`,
  ].join('\n    ')

  return html.replace('<head>', `<head>\n    ${injected}`)
}

function fallbackHtml(): string {
  return `<!doctype html><html><body style="font-family:sans-serif;padding:24px">
    <h3>DevHub webview not built</h3>
    <p>Run <code>npm run build:webview</code> in the <code>extension</code> package, then reopen.</p>
  </body></html>`
}
