import { marked } from 'marked'
import hljs from 'highlight.js/lib/common'

// Use marked with no custom renderer — v18 changed how renderer extensions work.
// Instead, we post-process the DOM after innerHTML is set.
marked.use({ gfm: true, breaks: false })

export function parseMarkdown(content: string): string {
  return marked.parse(content) as string
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
