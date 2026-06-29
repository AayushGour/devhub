/* eslint-disable @typescript-eslint/no-explicit-any */
let pyodide: any = null
let pyodideLoading: Promise<any> | null = null

// This worker is loaded as an ES module ({ type: 'module' }), where importScripts()
// is forbidden. Load pyodide via its ESM build instead. @vite-ignore keeps Vite from
// trying to resolve/bundle the CDN URL — it's fetched at runtime in the worker.
async function getPyodide(): Promise<any> {
  if (pyodide) return pyodide
  if (!pyodideLoading) {
    // Non-literal specifier so TS doesn't try to resolve the remote module.
    const pyodideUrl = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs'
    pyodideLoading = import(/* @vite-ignore */ pyodideUrl).then((m: any) => m.loadPyodide())
  }
  pyodide = await pyodideLoading
  return pyodide
}

self.onmessage = async ({ data: { id, code } }: MessageEvent<{ id: string; code: string }>) => {
  const stdout: string[] = []
  try {
    const py = await getPyodide()
    py.setStdout({ batched: (s: string) => stdout.push(s) })
    const result = await py.runPythonAsync(code)
    self.postMessage({ id, ok: true, result: String(result ?? ''), stdout })
  } catch (err: any) {
    // Always post back — a thrown/rejected handler would leave the caller hanging
    // until its 30s timeout, which the agent then retries in a loop.
    self.postMessage({ id, ok: false, error: err?.message ?? String(err), stdout })
  }
}
