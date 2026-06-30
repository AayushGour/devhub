// JavaScript has no big download to wait on (unlike Pyodide), so anything past
// this is almost certainly a runaway loop — kill it.
const TIMEOUT_MS = 10_000

let _worker: Worker | null = null

// Track in-flight calls so the onerror handler (and a hard kill) can settle them
// immediately instead of leaving the agent waiting out the full timeout.
const _pending = new Map<string, { timer: ReturnType<typeof setTimeout>; resolve: (v: string) => void }>()

function getWorker(): Worker {
  if (_worker) return _worker
  const w = new Worker(new URL('../workers/runJavaScript.worker.ts', import.meta.url), { type: 'module' })
  w.onerror = (e) => {
    _worker = null
    const msg = `[ERROR] run_javascript: worker error — ${e.message ?? 'failed to initialize'}`
    for (const [, { timer, resolve }] of _pending) {
      clearTimeout(timer)
      resolve(msg)
    }
    _pending.clear()
  }
  _worker = w
  return w
}

// Hard-stop the worker. A synchronous infinite loop never yields to postMessage,
// so terminate() is the only way to reclaim the thread; the next call spins up a
// fresh worker. Every pending call is settled with `reason`.
function killWorker(reason: string) {
  if (_worker) {
    _worker.terminate()
    _worker = null
  }
  for (const [, { timer, resolve }] of _pending) {
    clearTimeout(timer)
    resolve(reason)
  }
  _pending.clear()
}

export async function executeRunJavaScript(args: Record<string, unknown>): Promise<string> {
  const code = args.code as string
  if (!code) return '[ERROR] run_javascript: code is required'

  const worker = getWorker()
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('message', handler)
      killWorker('[ERROR] run_javascript: timed out after 10s and was terminated (likely an infinite loop)')
    }, TIMEOUT_MS)

    _pending.set(id, { timer, resolve })

    function handler(e: MessageEvent) {
      if (!e.data || e.data.id !== id) return
      worker.removeEventListener('message', handler)
      clearTimeout(timer)
      _pending.delete(id)

      const { ok, result, error, logs } = e.data
      const logStr = logs.length > 0 ? `\nLogs:\n${logs.join('\n')}` : ''
      resolve(ok ? `Result: ${result}${logStr}` : `[ERROR] ${error}${logStr}`)
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, code })
  })
}
