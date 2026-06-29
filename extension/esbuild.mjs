import * as esbuild from 'esbuild'
import { fileURLToPath, URL } from 'node:url'

const watch = process.argv.includes('--watch')
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [here('src/extension.ts')],
  bundle: true,
  outfile: here('dist/extension.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // The VSCode API is provided by the host at runtime; never bundle it.
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[esbuild] watching extension host…')
} else {
  await esbuild.build(options)
}
