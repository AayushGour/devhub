import { marked } from 'marked'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'

// Use marked with no custom renderer — v18 changed how renderer extensions work.
// Instead, we post-process the DOM after innerHTML is set.
marked.use({ gfm: true, breaks: false })

// Sanitize at the source: every caller assigns this output to innerHTML, so the
// markdown (which may be imported from untrusted files) must be XSS-safe here.
export function parseMarkdown(content: string): string {
  const { frontmatter, body } = splitFrontmatter(content)
  const fmHtml = frontmatter ? frontmatterTable(parseFrontmatter(frontmatter)) : ''
  return DOMPurify.sanitize(fmHtml + (marked.parse(body) as string))
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c])
}

// Splits a leading YAML frontmatter block (`---` … `---`) from the body. Only
// treats it as frontmatter when it actually contains `key:` lines, so a document
// that merely opens with a thematic break isn't mistaken for one.
function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content)
  if (!m || !/^\s*[A-Za-z0-9_.$-]+\s*:/m.test(m[1])) return { frontmatter: null, body: content }
  return { frontmatter: m[1], body: content.slice(m[0].length) }
}

// Minimal YAML reader — enough to render frontmatter as a key/value table without
// pulling in a YAML dependency. Nested/indented lines are folded into the value.
function parseFrontmatter(yaml: string): [string, string][] {
  const rows: [string, string][] = []
  const lines = yaml.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const m = /^([A-Za-z0-9_.$-]+)\s*:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    let value = m[2]
    const extra: string[] = []
    while (i + 1 < lines.length && /^(\s+\S|\s*-\s)/.test(lines[i + 1])) {
      const t = lines[++i].trim().replace(/^-\s*/, '')
      if (t) extra.push(t)
    }
    if (extra.length) value = (value ? value + ', ' : '') + extra.join(', ')
    value = value.replace(/^["']|["']$/g, '')
    rows.push([m[1], value])
  }
  return rows
}

function frontmatterTable(rows: [string, string][]): string {
  if (!rows.length) return ''
  const body = rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('')
  return (
    `<table class="frontmatter-table"><thead><tr><th>Property</th><th>Value</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  )
}

/**
 * Post-process a rendered preview element:
 * 1. Apply hljs syntax highlighting to code blocks
 * 2. Convert `code.language-mermaid` blocks to mermaid-renderable divs
 */
export function postProcessPreview(container: HTMLElement): { hasMermaid: boolean } {
  let hasMermaid = false

  container.querySelectorAll<HTMLElement>('pre > code').forEach((codeEl) => {
    const pre = codeEl.parentElement!
    const className = codeEl.className // e.g. "language-typescript"
    const lang = className.replace('language-', '').trim()

    if (lang === 'mermaid') {
      // Replace <pre><code class="language-mermaid">...</code></pre>
      // with a <div class="mermaid-block"><pre class="mermaid">...</pre></div>
      const rawSource = codeEl.textContent ?? ''
      const wrapper = document.createElement('div')
      wrapper.className = 'mermaid-block'
      const mermaidPre = document.createElement('pre')
      mermaidPre.className = 'mermaid'
      mermaidPre.textContent = rawSource  // textContent = safe, no HTML encoding issues
      wrapper.appendChild(mermaidPre)
      pre.replaceWith(wrapper)
      hasMermaid = true
      return
    }

    // Apply hljs highlighting
    if (lang && hljs.getLanguage(lang)) {
      codeEl.innerHTML = hljs.highlight(codeEl.textContent ?? '', {
        language: lang,
        ignoreIllegals: true,
      }).value
    } else if (codeEl.textContent?.trim()) {
      codeEl.innerHTML = hljs.highlightAuto(codeEl.textContent).value
    }

    codeEl.classList.add('hljs')
    if (lang) codeEl.classList.add(`language-${lang}`)
  })

  return { hasMermaid }
}
