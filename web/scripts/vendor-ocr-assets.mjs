// Copies the runtime assets that Tesseract and ONNX Runtime would otherwise
// fetch from third-party CDNs into public/, before a build.
//
// Both libraries load pieces of themselves at runtime, defaulting to jsDelivr
// and unpkg. That makes OCR and narration depend on those hosts being
// reachable, and on them publishing the exact versions we build against — a
// failure that only ever shows up in production.
//
// These live in public/ rather than as `?url` imports because both loaders
// resolve siblings by relative path: hashed asset names break that lookup.
// The directory is gitignored — npm supplies everything except the language
// data, which is fetched once and cached.

import { mkdir, copyFile, writeFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

// Only the SIMD build. Every browser that can run this app has had wasm SIMD
// for years, and shipping the scalar fallback too would double the payload.
const TESSERACT = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm', 'tesseract-core-simd.wasm'],
]

const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'
const LANG_FILE = 'eng.traineddata.gz'

// The ONNX Runtime that actually executes Kokoro. Resolved through kokoro-js so
// these always match the transformers version kokoro-js itself depends on,
// which is not the one npm hoisted to the top of node_modules.
const kokoroDir = dirname(dirname(require.resolve('kokoro-js')))
const ORT = [
  ['@huggingface/transformers', 'ort-wasm-simd-threaded.jsep.mjs'],
  ['onnxruntime-web', 'ort-wasm-simd-threaded.jsep.wasm'],
]

/** Package root for `name` as resolved from kokoro-js, whatever npm hoisted. */
function packageRoot(name) {
  let dir = dirname(require.resolve(name, { paths: [kokoroDir] }))
  // Neither package exports ./package.json, so walk up from the resolved entry
  // point until the directory named by the package itself is reached.
  const tail = name.split('/').pop()
  while (dir.split(sep).pop() !== tail) {
    const up = dirname(dir)
    if (up === dir) throw new Error(`could not locate the root of ${name}`)
    dir = up
  }
  return dir
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const tessDir = join(publicDir, 'tesseract')
const ortDir = join(publicDir, 'ort')
await mkdir(join(tessDir, 'lang'), { recursive: true })
await mkdir(ortDir, { recursive: true })

for (const [spec, to] of TESSERACT) {
  await copyFile(require.resolve(spec), join(tessDir, to))
  console.log(`vendored tesseract/${to}`)
}

for (const [pkg, file] of ORT) {
  await copyFile(join(packageRoot(pkg), 'dist', file), join(ortDir, file))
  console.log(`vendored ort/${file}`)
}

// The language data is not on npm. Fetched once and cached; a failure here
// fails the build rather than leaving OCR to break for users at runtime.
const langPath = join(tessDir, 'lang', LANG_FILE)
if (await exists(langPath)) {
  console.log(`${LANG_FILE} already vendored`)
} else {
  const response = await fetch(LANG_URL)
  if (!response.ok) throw new Error(`${LANG_URL} -> HTTP ${response.status}`)
  await writeFile(langPath, Buffer.from(await response.arrayBuffer()))
  console.log(`vendored ${LANG_FILE}`)
}
