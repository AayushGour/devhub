import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Builds the webview React app. It imports the existing DevHub preview
// components from ../web/src (via the `@` alias) and outputs a self-contained
// bundle into extension/media, which the extension host loads into a webview.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: fileURLToPath(new URL('./webview', import.meta.url)),
  // Relative base so the host can resolve assets via webview.asWebviewUri.
  base: './',
  resolve: {
    alias: {
      // Match how the web app's feature files import their own modules.
      '@': fileURLToPath(new URL('../web/src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./media', import.meta.url)),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'tiktoken'],
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      // Allow reading the shared web sources that live outside the webview root.
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})
