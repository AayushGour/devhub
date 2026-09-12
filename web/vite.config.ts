/// <reference types="vitest/config" />
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
  optimizeDeps: {
    // Do NOT exclude @xenova/transformers: excluding it while onnxruntime-web
    // still gets pre-bundled splits them into two module instances, leaving
    // ort's backend registry undefined ("Cannot read ... 'registerBackend'").
    //
    // web-tree-sitter is an emscripten ES module; letting esbuild pre-bundle its
    // glue mangles the wasm path logic. We locate the core wasm ourselves via a
    // Vite `?url` asset + Parser.init({ locateFile }), so keep it unbundled.
    exclude: ['pdfjs-dist', 'tiktoken', 'web-tree-sitter'],
    //
    // These are imported only from inside Web Workers, so Vite's startup scan
    // of the module graph never sees them. Left to discover them at runtime it
    // optimizes mid-session and force-reloads the page — which also destroys
    // the worker while a request is still in flight. Naming them here gets them
    // pre-bundled before the first render instead.
    include: ['kokoro-js', '@breezystack/lamejs', 'tesseract.js'],
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
})
