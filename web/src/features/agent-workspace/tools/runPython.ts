// First-time Pyodide download is ~20 MB from CDN; allow 2 minutes for slow connections.
const TIMEOUT_MS = 120_000

let _worker: Worker | null = null

// Track in-flight calls so the onerror handler can reject them immediately instead
// of waiting for the 2-minute timeout to expire.
const _pending = new Map<string, { timer: ReturnType<typeof setTimeout>; resolve: (v: string) => void }>()

function getWorker(): Worker {
  if (_worker) return _worker
  const w = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), { type: 'module' })
  w.onerror = (e) => {
    _worker = null
    const msg = `[ERROR] run_python: worker error — ${e.message ?? 'failed to initialize'}`
    for (const [, { timer, resolve }] of _pending) {
      clearTimeout(timer)
      resolve(msg)
    }
    _pending.clear()
  }
  _worker = w
  return w
}

export async function executeRunPython(args: Record<string, unknown>): Promise<string> {
  const code = args.code as string
  if (!code) return '[ERROR] run_python: code is required'

  const worker = getWorker()
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('message', handler)
      _pending.delete(id)
      resolve('[ERROR] run_python: timed out after 2 minutes (Pyodide may still be loading from CDN on first use)')
    }, TIMEOUT_MS)

    _pending.set(id, { timer, resolve: (v) => { resolve(v); _pending.delete(id) } })

    function handler(e: MessageEvent) {
      if (!e.data || e.data.id !== id) return
      worker.removeEventListener('message', handler)
      clearTimeout(timer)
      _pending.delete(id)

      const { ok, result, error, stdout } = e.data
      const stdoutStr = stdout.length > 0 ? `\nOutput:\n${stdout.join('\n')}` : ''
      resolve(ok ? `Result: ${result}${stdoutStr}` : `[ERROR] ${error}${stdoutStr}`)
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, code })
  })
}
