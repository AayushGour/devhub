// Display formatting shared across the studio's components.
// Kept out of component files so fast refresh stays intact.

/** `1:04:09` / `4:09` — a playback position or duration. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** `2h 14m` — a coarse length, for library listings. */
export function formatLength(seconds: number): string {
  // A book still being narrated has no duration yet, and the arithmetic that
  // produces one divides by a chapter count that can be zero.
  if (!Number.isFinite(seconds) || seconds < 0) return '0s'
  // Round to whole seconds BEFORE deciding the unit, or 59.6 prints as "60s"
  // when it should have tipped over into "1m".
  const whole = Math.round(seconds)
  if (whole < 60) return `${whole}s`
  const minutes = Math.round(whole / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}
