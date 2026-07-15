// Slide body renderer: turns a parseMarkdown() HTML string into its FINAL rendered
// form — hljs highlighting applied and mermaid code blocks replaced with inline SVG —
// as a string, so the result can be handed to React via dangerouslySetInnerHTML and
// OWNED by React.
//
// Why this exists (and why deck mode can't reuse continuous mode's postProcessPreview):
// continuous mode sets innerHTML imperatively on a node React doesn't manage, then
// mutates that live DOM in place (hljs spans, mermaid SVG). In deck mode the slide body
// is React-owned (a layout's dangerouslySetInnerHTML), so any imperative post-mutation
// gets reverted the next time React re-renders that node (e.g. on the overflow-scale
// state update or an app-theme change) — React re-commits the original __html. The fix
// is to never mutate React-owned DOM after the fact: compute the fully-processed HTML
// string up front (including mermaid rendered to SVG via mermaid.render, which returns a
// string and needs no live DOM node) and let React render that stable string.
import hljs from 'highlight.js/lib/common'
import mermaid from 'mermaid'
import { initMermaid } from './mermaidHelper'

let mermaidSeq = 0

// mermaid.render() returns an SVG string without needing the block inserted in the live
// document first (unlike mermaid.run), which is exactly what lets us pre-render to a
// string here. Each call gets a unique id so multiple diagrams in one deck don't collide
// on mermaid's internal element ids.
async function renderMermaidToSvg(code: string, appTheme: string): Promise<string | null> {
  initMermaid(appTheme)
  const id = `slide-mermaid-${Date.now()}-${mermaidSeq++}`
  try {
    const { svg } = await mermaid.render(id, code)
    return svg
  } catch {
    return null // malformed diagram: caller keeps the original code block, not a crash
  }
}

/**
 * Processes one parseMarkdown() HTML string into its final rendered HTML string.
 * - `pre > code.language-mermaid` → `<div class="mermaid-block">…svg…</div>`
 * - other `pre > code` → hljs-highlighted (explicit language if known, else auto)
 * A mermaid block that fails to render is left as its original highlighted code block
 * (graceful degradation — never throws, never drops the slide).
 *
 * Runs on a detached <template> so nothing touches the live document until React
 * renders the returned string.
 */
export async function renderSlideBodyHtml(html: string, appTheme: string): Promise<string> {
  const tpl = document.createElement('template')
  tpl.innerHTML = html

  const codeEls = Array.from(tpl.content.querySelectorAll<HTMLElement>('pre > code'))
  for (const codeEl of codeEls) {
    const lang = codeEl.className.replace('language-', '').trim()

    if (lang === 'mermaid') {
      const svg = await renderMermaidToSvg(codeEl.textContent ?? '', appTheme)
      if (svg) {
        const wrapper = document.createElement('div')
        wrapper.className = 'mermaid-block'
        wrapper.innerHTML = svg
        codeEl.parentElement?.replaceWith(wrapper)
        continue
      }
      // fall through to highlight the raw mermaid source if render failed
    }

    if (lang && hljs.getLanguage(lang)) {
      codeEl.innerHTML = hljs.highlight(codeEl.textContent ?? '', { language: lang, ignoreIllegals: true }).value
    } else if (codeEl.textContent?.trim()) {
      codeEl.innerHTML = hljs.highlightAuto(codeEl.textContent).value
    }
    codeEl.classList.add('hljs')
    if (lang) codeEl.classList.add(`language-${lang}`)
  }

  return tpl.innerHTML
}
