import * as fs from 'node:fs'
import * as path from 'node:path'

const NAV_INTERCEPTOR = `<script>
(function () {
  function isRelative(href) {
    return href && !href.match(/^(https?:|ftp:|mailto:|data:|#|\\/\\/)/);
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return; // anchor — allow default scroll
    e.preventDefault();
    e.stopPropagation();
    if (href.match(/^https?:/)) {
      window.parent.postMessage({ type: 'devhub-external', href: href }, '*');
    } else if (isRelative(href)) {
      window.parent.postMessage({ type: 'devhub-navigate', href: href }, '*');
    }
  }, true);
})();
</script>`

/** Inject link-interception script into <head> (or prepend if no <head>). */
export function injectNavInterceptor(html: string): string {
  if (html.includes('<head>')) return html.replace('<head>', `<head>${NAV_INTERCEPTOR}`)
  if (html.includes('<Head>')) return html.replace('<Head>', `<Head>${NAV_INTERCEPTOR}`)
  // No <head> tag — prepend script before everything else
  return NAV_INTERCEPTOR + html
}

/** Inline relative CSS, JS, and image assets referenced in an HTML string. */
export function inlineAssets(html: string, baseDir: string): string {
  // <link rel="stylesheet" href="...">
  html = html.replace(
    /<link([^>]*)\brel=["']stylesheet["']([^>]*)>/gi,
    (match, before, after) => {
      const href = extractAttr(match, 'href')
      if (!href || !isRelativePath(href)) return match
      const css = readFile(path.resolve(baseDir, href))
      if (css === null) return match
      return `<style>${inlineCssImports(css, path.dirname(path.resolve(baseDir, href)))}</style>`
    },
  )

  // <script src="..."></script>
  html = html.replace(/<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, before, src, after) => {
    if (!isRelativePath(src)) return match
    const js = readFile(path.resolve(baseDir, src))
    if (js === null) return match
    return `<script${before}${after}>${js}</script>`
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

/** Recursively inline @import rules inside a CSS string. */
function inlineCssImports(css: string, baseDir: string): string {
  return css.replace(
    /@import\s+(?:url\()?["']([^"')]+)["']\)?[^;]*;/g,
    (match, href) => {
      if (!isRelativePath(href)) return match
      const absPath = path.resolve(baseDir, href)
      const imported = readFile(absPath)
      if (imported === null) return match
      return inlineCssImports(imported, path.dirname(absPath))
    },
  )
}

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i')
  const m = tag.match(re)
  return m ? m[1] : null
}

function isRelativePath(href: string): boolean {
  return !href.match(/^(https?:|ftp:|mailto:|data:|#|\/\/)/)
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
