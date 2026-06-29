import * as vscode from 'vscode'
import { PreviewManager } from './PreviewManager'
import { PanelManager } from './PanelManager'

export function activate(context: vscode.ExtensionContext) {
  const previews = new PreviewManager(context)
  const panels = new PanelManager(context)

  context.subscriptions.push(
    vscode.commands.registerCommand('devhub.openPreviewToSide', () =>
      previews.openForActiveEditor(),
    ),
    vscode.commands.registerCommand('devhub.openTokenCount', () =>
      previews.openForActiveEditor('token'),
    ),
    vscode.commands.registerCommand('devhub.openCrypto', () =>
      panels.open('crypto', 'DevHub: Crypto Studio'),
    ),
    vscode.commands.registerCommand('devhub.openImage', () =>
      panels.open('image', 'DevHub: Image Studio'),
    ),
  )
}

export function deactivate() {}
