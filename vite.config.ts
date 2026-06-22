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
  base: '/devhub/',
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
