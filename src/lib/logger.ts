// Lightweight namespaced logger. Verbose by default (works in prod builds too,
// e.g. GitHub Pages), so diagnostics are available without a dev server.
//
// Silence at runtime:  localStorage.setItem('devhub:debug', 'off')
// Re-enable:           localStorage.removeItem('devhub:debug')
// Filter namespaces:   localStorage.setItem('devhub:debug', 'rag,repo')  // substring match
//
// The config is read once and cached; it refreshes when another tab changes the
// setting (`storage` event) or when `refreshLogConfig()` is called in this tab.

interface LogConfig {
  enabled: boolean
  filter: string[]
}

function readConfig(): LogConfig {
  try {
    const raw = localStorage.getItem('devhub:debug')
    if (raw === 'off' || raw === 'false') return { enabled: false, filter: [] }
    if (raw && raw !== 'on' && raw !== 'true') {
      return { enabled: true, filter: raw.split(',').map((s) => s.trim()).filter(Boolean) }
    }
  } catch {
    // localStorage unavailable (SSR / sandboxed) — fall through to default-on
  }
  return { enabled: true, filter: [] }
}

let _config: LogConfig = readConfig()

export function refreshLogConfig(): void {
  _config = readConfig()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'devhub:debug') _config = readConfig()
  })
  // Expose a one-liner toggle for the console.
  ;(window as unknown as { devhubDebug?: (v?: string) => void }).devhubDebug = (v) => {
    if (v === undefined) localStorage.removeItem('devhub:debug')
    else localStorage.setItem('devhub:debug', v)
    refreshLogConfig()
    console.log('[logger] config:', _config)
  }
}

function active(ns: string): boolean {
  if (!_config.enabled) return false
  if (_config.filter.length === 0) return true
  return _config.filter.some((f) => ns.includes(f))
}

export interface Logger {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  /** Start a timer; call the returned fn to log elapsed ms with an optional payload. */
  time: (label: string) => (...extra: unknown[]) => void
}

export function createLogger(ns: string): Logger {
  const prefix = `[${ns}]`
  return {
    log: (...args) => { if (active(ns)) console.log(prefix, ...args) },
    warn: (...args) => { if (active(ns)) console.warn(prefix, ...args) },
    // Errors always surface, regardless of the verbose toggle.
    error: (...args) => console.error(prefix, ...args),
    time: (label) => {
      const t0 = performance.now()
      return (...extra) => {
        if (active(ns)) console.log(prefix, `${label} — ${(performance.now() - t0).toFixed(0)}ms`, ...extra)
      }
    },
  }
}
