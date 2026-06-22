/* eslint-disable @typescript-eslint/no-explicit-any */
let pyodide: any = null

self.onmessage = async ({ data: { id, code } }: MessageEvent<{ id: string; code: string }>) => {
  if (!pyodide) {
    ;(self as any).importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js')
    pyodide = await (self as any).loadPyodide()
  }

  const stdout: string[] = []
  pyodide.setStdout({ batched: (s: string) => stdout.push(s) })

  try {
    const result = await pyodide.runPythonAsync(code)
    self.postMessage({ id, ok: true, result: String(result ?? ''), stdout })
  } catch (err: any) {
    self.postMessage({ id, ok: false, error: err.message, stdout })
  }
}
