import type { SlideRenderInput } from '../../utils/slideParser'
import { slideStyleToReactStyle } from '../../utils/slideStyle'

// Content layout: fallback layout with optional title + full body markdown.
// Applies per-slide title/body styling. Markdown is already rendered by SlideCard.
export default function ContentLayout({ config, bodyHtml }: SlideRenderInput) {
  const { title: titleStyle, body: bodyStyle } = slideStyleToReactStyle(config.style)
  return (
    <div className="flex flex-1 flex-col p-8 gap-3 overflow-hidden">
      {config.title && <h2 className="text-[1.55em] font-semibold leading-tight" style={titleStyle}>{config.title}</h2>}
      <div className="markdown-preview" style={bodyStyle} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  )
}
