/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, sep } from 'node:path'

// kokoro-js imports `@huggingface/transformers` as a bare specifier, which
// resolves to its OWN nested copy — a different version from the one hoisted for
// rag-studio. Setting `env.backends.onnx.wasm.wasmPaths` only works on that
// exact module instance, so the narration worker needs a way to import it
// without forcing every other studio onto kokoro's version.
const require = createRequire(import.meta.url)
const kokoroDir = dirname(dirname(require.resolve('kokoro-js')))
let transformersRoot = dirname(require.resolve('@huggingface/transformers', { paths: [kokoroDir] }))
while (transformersRoot.split(sep).pop() !== 'transformers') {
  transformersRoot = dirname(transformersRoot)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'kokoro-transformers': transformersRoot,
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
    // Five suites' worth of worker/IDB fakes on a loaded machine can blow the
    // 5s default; the work itself is milliseconds.
    testTimeout: 20000,
    passWithNoTests: true,
  },
})
