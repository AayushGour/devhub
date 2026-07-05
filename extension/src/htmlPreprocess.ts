import * as fs from 'node:fs'
import * as path from 'node:path'

const NAV_INTERCEPTOR = `<script>
(function () {
  function isRelative(href) {
    return href && !href.match(/^(https?:|ftp:|mailto:|data:|#|\\/\\/|\\/)/);
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    // Always preventDefault — srcdoc iframes in Electron lose their content on
    // ANY navigation, including #anchor fragments, resulting in a blank page.
    e.preventDefault();
    e.stopPropagation();
    if (href.startsWith('#')) {
      // Scroll manually within the iframe instead of navigating.
      var id = href.slice(1);
      var target = document.getElementById(id) || document.querySelector('[name="' + id + '"]');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (href.match(/^https?:/)) {
      window.parent.postMessage({ type: 'devhub-external', href: href }, '*');
    } else if (isRelative(href)) {
      window.parent.postMessage({ type: 'devhub-navigate', href: href }, '*');
    }
  }, true);
})();
</script>`

/** Inject link-interception script after <head> (or prepend if no <head>). */
export function injectNavInterceptor(html: string): string {
  // Match <head> with any attributes, case-insensitive — plain string match missed <head lang="en"> / <HEAD>
  const m = html.match(/<head(\s[^>]*)?\s*>/i)
  if (m?.index !== undefined) {
    const insertAt = m.index + m[0].length
    return html.slice(0, insertAt) + NAV_INTERCEPTOR + html.slice(insertAt)
  }
  return NAV_INTERCEPTOR + html
}

/** Inline relative CSS, JS, and image assets referenced in an HTML string. */
export function inlineAssets(html: string, baseDir: string): string {
  // <link rel="stylesheet" href="...">
  html = html.replace(
    /<link([^>]*)\brel=["']stylesheet["']([^>]*)>/gi,
    (match) => {
      const href = extractHref(match)
      if (!href || !isRelativePath(href)) return match
      const absPath = path.resolve(baseDir, href)
      const css = readFile(absPath)
      if (css === null) return match
      return `<style>${inlineCssImports(css, path.dirname(absPath), new Set([absPath]))}</style>`
    },
  )

  // <script src="..."></script>
  html = html.replace(/<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, before, src, after) => {
    if (!isRelativePath(src)) return match
    const js = readFile(path.resolve(baseDir, src))
    if (js === null) return match
    // Escape </script> inside inlined content so the HTML parser doesn't close the tag early
    return `<script${before}${after}>${js.replace(/<\/script>/gi, '<\\/script>')}</script>`
  })

  // <img src="...">
  html = html.replace(/(<img[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
    if (!isRelativePath(src)) return match
    const absPath = path.resolve(baseDir, src)
    const b64 = readFileBase64(absPath)
    if (b64 === null) return match
    const mime = imageMime(absPath)
    return `${prefix}data:${mime};base64,${b64}${suffix}`
  })

  // <source src="..."> (audio/video)
  html = html.replace(/(<source[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
    if (!isRelativePath(src)) return match
    const absPath = path.resolve(baseDir, src)
    const b64 = readFileBase64(absPath)
    if (b64 === null) return match
    const mime = videoMime(absPath)
    return `${prefix}data:${mime};base64,${b64}${suffix}`
  })

  return html
}

/**
 * Recursively inline @import rules inside a CSS string.
 * `visited` tracks absolute paths already inlined to break circular imports.
 */
function inlineCssImports(css: string, baseDir: string, visited: Set<string>): string {
  return css.replace(
    /@import\s+(?:url\()?["']([^"')]+)["']\)?[^;]*;/g,
    (match, href) => {
      if (!isRelativePath(href)) return match
      const absPath = path.resolve(baseDir, href)
      if (visited.has(absPath)) return '' // break circular import
      visited.add(absPath)
      const imported = readFile(absPath)
      if (imported === null) return match
      return inlineCssImports(imported, path.dirname(absPath), visited)
    },
  )
}

const HREF_RE = /\bhref=["']([^"']+)["']/i

function extractHref(tag: string): string | null {
  const m = tag.match(HREF_RE)
  return m ? m[1] : null
}

function isRelativePath(href: string): boolean {
  // Block absolute paths (single /), protocol-relative (//), and named schemes.
  // path.resolve(base, '/absolute') ignores base entirely — must be excluded here.
  if (href.startsWith('/')) return false
  return !href.match(/^(https?:|ftp:|mailto:|data:|#)/)
}

function readFile(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
}

function readFileBase64(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath).toString('base64')
  } catch {
    return null
  }
}

function imageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
  }
  return map[ext] ?? 'image/png'
}

function videoMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  }
  return map[ext] ?? 'application/octet-stream'
}
