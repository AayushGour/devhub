import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: process.env.VITE_BASE_PATH ?? '/devhub/',
  // Cross-origin isolation enables SharedArrayBuffer → multi-threaded WASM for the
  // CPU LLM. `credentialless` keeps cross-origin model/CDN fetches working without
  // requiring CORP headers on them. In production (GitHub Pages can't set headers)
  // the same isolation is provided by public/coi-serviceworker.js.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    // Do NOT exclude @xenova/transformers: excluding it while onnxruntime-web
    // still gets pre-bundled splits them into two module instances, leaving
    // ort's backend registry undefined ("Cannot read ... 'registerBackend'").
    exclude: ['pdfjs-dist', 'tiktoken'],
  },
  worker: {
    format: 'es',
  },
})
