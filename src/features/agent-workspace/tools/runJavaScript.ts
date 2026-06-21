const TIMEOUT_MS = 5000

const IFRAME_SRCDOC = `
<script>
window.addEventListener('message', async (e) => {
  const { id, code } = e.data
  const logs = []
  const _log = console.log
  console.log = (...a) => { logs.push(a.map(String).join(' ')); _log(...a) }
  try {
    const result = await eval(code)
    parent.postMessage({ id, ok: true, result: String(result ?? '(no return value)'), logs }, '*')
  } catch(err) {
    parent.postMessage({ id, ok: false, error: err.message, logs }, '*')
  } finally {
    console.log = _log
  }
})
</script>
`

let _iframe: HTMLIFrameElement | null = null

function getIframe(): HTMLIFrameElement {
  if (_iframe) return _iframe
  const el = document.createElement('iframe')
  el.setAttribute('sandbox', 'allow-scripts')
  el.srcdoc = IFRAME_SRCDOC
  el.style.display = 'none'
  document.body.appendChild(el)
  _iframe = el
  return el
}

export async function executeRunJavaScript(args: Record<string, unknown>): Promise<string> {
  const code = args.code as string
  if (!code) return '[ERROR] run_javascript: code is required'

  const iframe = getIframe()
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve('[ERROR] run_javascript: timed out after 5s')
    }, TIMEOUT_MS)

    function handler(e: MessageEvent) {
      if (!e.data || e.data.id !== id) return
      window.removeEventListener('message', handler)
      clearTimeout(timer)

      const { ok, result, error, logs } = e.data
      const logStr = logs.length > 0 ? `\nLogs:\n${logs.join('\n')}` : ''
      if (ok) {
        resolve(`Result: ${result}${logStr}`)
      } else {
        resolve(`[ERROR] ${error}${logStr}`)
      }
    }

    window.addEventListener('message', handler)
    iframe.contentWindow?.postMessage({ id, code }, '*')
  })
}
