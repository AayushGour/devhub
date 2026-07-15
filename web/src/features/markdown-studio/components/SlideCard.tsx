import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import './SlideCard.css'
import { parseMarkdown } from '../utils/parser'
import { renderSlideBodyHtml } from '../utils/slideContentRenderer'
import { measureAndScale } from '../utils/slideOverflow'
import { DEFAULT_DECK_FOOTER, mergeFooter, mergeSlideStyle, slideStyleToReactStyle } from '../utils/slideStyle'
import type { DeckFooterDefaults, SlideStyle } from '../utils/slideStyle'
import { SLIDE_LAYOUTS } from '../utils/slideParser'
import type { SlideConfig, SlideRenderInput } from '../utils/slideParser'
import { useSettingsStore } from '@/store/settingsStore'

interface SlideCardProps {
  config: SlideConfig
  pageNumber: number
  // Deck-level footer defaults (from the document's `type: deck` block, see
  // slideParser.ts's extractDeckConfig) this slide's `footer` field-merges over
  // (mergeFooter). Falls back to DEFAULT_DECK_FOOTER when the deck has no
  // `type: deck` block.
  deckFooter?: DeckFooterDefaults
  // Deck-level style defaults (from the document's `type: deck` block) this slide's
  // `style` field-merges over, per category/property (mergeSlideStyle). Falls back to
  // {} (built-in per-layout defaults only) when the deck has no `type: deck` block.
  deckStyle?: SlideStyle
}

// Fixed export box height (13.333in x 7.5in at export) — for the PREVIEW card, overflow
// is measured against the card's own rendered pixel height (project-context.md
// Architecture "Constants": "preview and print use identical measureAndScale, just
// different box px").
export default function SlideCard({ config, pageNumber, deckFooter = DEFAULT_DECK_FOOTER, deckStyle = {} }: SlideCardProps) {
  const { theme: appTheme } = useSettingsStore()
  const boxRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState<{ scale: number; clipped: boolean }>({ scale: 1, clipped: false })

  const mergedStyle = useMemo(() => mergeSlideStyle(deckStyle, config.style), [deckStyle, config.style])
  const reactStyle = slideStyleToReactStyle(mergedStyle)
  const footer = mergeFooter(config.footer, deckFooter)

  // Every SLIDE_LAYOUTS component reads style off `config.style` directly (each calls
  // slideStyleToReactStyle(config.style) itself, for its own title/body elements — only
  // the wrapper background is applied here in SlideCard). Layouts receive this
  // deck-merged config (mergedStyle substituted in) rather than the raw prop, so a
  // slide's rendered title/body pick up deck-level style.title/style.body the same way
  // the wrapper background already does — one merge, done once, in SlideCard. Memoized
  // (not a plain spread) so rawRender's own useMemo below still only recomputes when
  // config/mergedStyle actually change, not on every render.
  const renderConfig = useMemo<SlideConfig>(
    () => ({ ...config, style: mergedStyle }),
    [config, mergedStyle]
  )

  // Raw parsed (but not yet hljs/mermaid post-processed) HTML — the synchronous first
  // paint, before the async renderer replaces mermaid code with SVG and applies hljs.
  const rawRender = useMemo<SlideRenderInput>(() => {
    const bodyHtml = parseMarkdown(renderConfig.body ?? '')
    const columnsHtml: [string, string] | undefined = renderConfig.columns
      ? [parseMarkdown(renderConfig.columns[0] ?? ''), parseMarkdown(renderConfig.columns[1] ?? '')]
      : undefined
    const captionHtml = renderConfig.caption ? parseMarkdown(renderConfig.caption) : undefined
    return { config: renderConfig, bodyHtml, columnsHtml, captionHtml }
  }, [renderConfig])

  // The FINAL, fully-processed render (hljs applied + mermaid rendered to inline SVG),
  // held in state so React owns a stable HTML string. This is the crux of the deck-mode
  // mermaid/hljs fix: we never mutate React-owned DOM after render (which React reverts
  // on its next re-render); instead the processed HTML string is the source of truth and
  // React renders it directly (see slideContentRenderer.ts).
  const [render, setRender] = useState<SlideRenderInput>(rawRender)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const bodyHtml = await renderSlideBodyHtml(rawRender.bodyHtml, appTheme)
      const columnsHtml = rawRender.columnsHtml
        ? ([
            await renderSlideBodyHtml(rawRender.columnsHtml[0], appTheme),
            await renderSlideBodyHtml(rawRender.columnsHtml[1], appTheme),
          ] as [string, string])
        : undefined
      const captionHtml = rawRender.captionHtml
        ? await renderSlideBodyHtml(rawRender.captionHtml, appTheme)
        : undefined
      if (cancelled) return
      setRender({ config: renderConfig, bodyHtml, columnsHtml, captionHtml })
    }
    run()
    return () => { cancelled = true }
  }, [rawRender, renderConfig, appTheme])

  // Measure overflow against the card's own box height AFTER the processed content
  // (including any mermaid SVG, which changes height) has been committed to the DOM.
  useLayoutEffect(() => {
    if (!contentRef.current || !boxRef.current) return
    const boxHeightPx = boxRef.current.clientHeight
    setOverflow(measureAndScale(contentRef.current, boxHeightPx))
  }, [render])

  const Layout = SLIDE_LAYOUTS[config.type]

  return (
    <div
      ref={boxRef}
      className="slide-card relative aspect-[16/9] w-full max-w-4xl mx-auto rounded-lg border border-border bg-surface shadow-[0_0.06rem_0.25rem_rgba(0,0,0,0.12)] overflow-hidden"
      // Sanctioned inline-style exception: runtime-dynamic, data-driven per-slide style
      // parsed from yaml (CLAUDE.md / coding-standards.md).
      style={reactStyle.wrapper}
    >
      <div
        ref={contentRef}
        className="slide-page__content flex h-full w-full flex-col"
        // Sanctioned inline-style exception: the overflow scale transform is computed
        // at runtime from measured DOM height, not a static/conditional value.
        style={{
          transform: overflow.scale !== 1 ? `scale(${overflow.scale})` : undefined,
          transformOrigin: 'top left',
          overflow: overflow.clipped ? 'hidden' : undefined,
        }}
      >
        <Layout {...render} />
      </div>

      {/* Chrome (footer / overflow badge): font-size stays cqw (container-relative —
          must scale proportionally between the small preview card and the 13.333in
          export page, same reason slide title/body text uses cqw/em). Positioning,
          padding, and gaps are ordinary Tailwind steps (rem, relative to the root
          font-size) — a couple of px difference in badge padding between preview and
          export doesn't visibly matter, so there's no need to make every utility
          container-relative, just the ones where the mismatch was actually visible. */}
      {footer.show && (
        <div className="slide-page__footer pointer-events-none absolute inset-x-3 bottom-2 flex items-center justify-between gap-2 text-[0.95cqw] text-on-surface-muted">
          <span className="truncate">{footer.left}</span>
          <span className="truncate text-center flex-1">{footer.center}</span>
          {/* Page number lives here now — not a standalone always-on corner badge.
              Opt-in via the resolved footer.pageNumber (deck-level default,
              per-slide override), default OFF. Renders alongside footer.right
              when both are present; footer.show:false hides the whole footer
              (and thus the number) for that slide, same as any other footer field. */}
          <span className="truncate flex items-center justify-end gap-1">
            {footer.right && <span className="truncate">{footer.right}</span>}
            {footer.pageNumber && <span>{pageNumber}</span>}
          </span>
        </div>
      )}

      {overflow.clipped && (
        <span
          className={cn(
            'slide-overflow-badge pointer-events-none absolute top-2 right-2 flex items-center gap-1 rounded-full',
            'bg-amber-500/90 px-2 py-0.5 text-[1.05cqw] font-medium text-white'
          )}
          title="Content overflows this slide — trim the source markdown. This badge is preview-only and never appears in the exported PDF."
        >
          <AlertTriangle size={11} />
          content overflows
        </span>
      )}
    </div>
  )
}
