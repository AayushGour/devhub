import { getVsCodeApi } from '../vscode-api'

/**
 * Sends the HTML string to the extension host, which writes it to a temp file
 * and opens it in the default browser. The user can then print to PDF via Ctrl+P.
 */
export function exportPDFViaHost(html: string, filename = 'document') {
  getVsCodeApi().postMessage({ type: 'exportPDF', html, filename })
}

/**
 * Sends the HTML string to the extension host, which writes it to a temp file
 * and opens it in the default browser for viewing.
 */
export function exportHTMLViaHost(html: string, filename = 'document') {
  getVsCodeApi().postMessage({ type: 'exportHTML', html, filename })
}
