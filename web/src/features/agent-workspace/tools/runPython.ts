const TIMEOUT_MS = 30000

let _worker: Worker | null = null

function getWorker(): Worker {
  if (_worker) return _worker
  _worker = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), { type: 'module' })
  return _worker
}

export async function executeRunPython(args: Record<string, unknown>): Promise<string> {
  const code = args.code as string
  if (!code) return '[ERROR] run_python: code is required'

  const worker = getWorker()
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.removeEventListener('message', handler)
      resolve('[ERROR] run_python: timed out after 30s')
    }, TIMEOUT_MS)

    function handler(e: MessageEvent) {
      if (!e.data || e.data.id !== id) return
      worker.removeEventListener('message', handler)
      clearTimeout(timer)

      const { ok, result, error, stdout } = e.data
      const stdoutStr = stdout.length > 0 ? `\nOutput:\n${stdout.join('\n')}` : ''
      if (ok) {
        resolve(`Result: ${result}${stdoutStr}`)
      } else {
        resolve(`[ERROR] ${error}${stdoutStr}`)
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ id, code })
  })
}
