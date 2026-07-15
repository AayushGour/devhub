import { useMemo } from 'react'
import { splitSlides, extractSlideConfig, isDeckChunk, extractDeckConfig } from '../utils/slideParser'
import SlideCard from './SlideCard'
import { DEFAULT_DECK_FOOTER, mergeFooter } from '../utils/slideStyle'
import type { DeckFooterDefaults, SlideStyle } from '../utils/slideStyle'

interface SlideDeckPreviewProps {
  content: string
}

// Deck-mode PreviewPane replacement: content -> splitSlides -> partition out any
// `type: deck` config chunk -> extractSlideConfig (rendered slides) -> SlideCard stack.
// Export reads this stack's rendered DOM via previewRef.innerHTML (see PreviewPane.tsx
// — the ref contract is unchanged from continuous mode).
//
// Deck-level config (docs/superpowers/specs/2026-07-15-deck-level-config-design.md):
// a `type: deck` chunk is never rendered as a slide. Its `style`/`footer` become the
// deck-wide defaults every slide field-merges over — same mechanism a slide's own
// footer already used to merge over a deck default (mergeFooter), now symmetric for
// style too (mergeSlideStyle, done inside SlideCard itself — this component only
// resolves the deck-level DEFAULTS, each SlideCard merges its own config.style/footer
// over them exactly once). If multiple `type: deck` chunks exist, the first is used
// for config and ALL of them are excluded from rendering. No `type: deck` block ->
// deck defaults are the built-in DEFAULT_DECK_FOOTER / {} (empty style).
export default function SlideDeckPreview({ content }: SlideDeckPreviewProps) {
  const { deckFooter, deckStyle, slideConfigs } = useMemo(() => {
    const chunks = splitSlides(content)
    const deckChunk = chunks.find(isDeckChunk)
    const deckConfig = deckChunk ? extractDeckConfig(deckChunk) : {}
    const deckFooter: DeckFooterDefaults = mergeFooter(deckConfig.footer, DEFAULT_DECK_FOOTER)
    const deckStyle: SlideStyle = deckConfig.style ?? {}
    const slideConfigs = chunks.filter(c => !isDeckChunk(c)).map(extractSlideConfig)
    return { deckFooter, deckStyle, slideConfigs }
  }, [content])

  if (slideConfigs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-on-surface-muted p-8">
        No slides yet — add content and separate slides with a line containing only <code className="mx-1">---</code>.
      </div>
    )
  }

  return (
    <div className="slide-deck-stack flex flex-col gap-6 p-6">
      {slideConfigs.map((config, i) => (
        <div key={i} className="slide-page">
          <SlideCard config={config} pageNumber={i + 1} deckFooter={deckFooter} deckStyle={deckStyle} />
        </div>
      ))}
    </div>
  )
}
