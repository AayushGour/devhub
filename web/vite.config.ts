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
