// Runs model-generated JavaScript OFF the main thread.
//
// The old implementation eval'd code in a sandboxed <iframe>, which shares the
// page's main-thread event loop: a `while(true)` (or any heavy synchronous code)
// froze the whole tab, and the 30s timeout guard — scheduled on that same blocked
// thread — could never fire. In a worker the UI stays responsive and the caller
// can `terminate()` the worker to actually kill a runaway loop.
self.onmessage = async ({ data: { id, code } }: MessageEvent<{ id: string; code: string }>) => {
  const logs: string[] = []
  const origLog = console.log
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try {
    // Direct eval: the last expression's value is returned, and awaiting it also
    // resolves code that returns a promise (e.g. `fetch(url).then(r => r.text())`).
    // Workers expose `fetch`, `crypto`, timers, etc. — but no DOM, so this is a
    // stricter sandbox than the previous iframe.
    // eslint-disable-next-line no-eval
    const result = await eval(code)
    self.postMessage({ id, ok: true, result: String(result ?? '(no return value)'), logs })
  } catch (err) {
    // Always post back — a thrown handler would leave the caller hanging until its
    // timeout, which the agent then retries in a loop.
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err), logs })
  } finally {
    console.log = origLog
  }
}
