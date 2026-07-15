import type { SlideRenderInput } from '../../utils/slideParser'
import { slideStyleToReactStyle } from '../../utils/slideStyle'

// Title slide layout: centered title/subtitle/author/date. This is the deck's cover/first slide.
// Ignores body. Applies per-slide title styling (color, fontSize, alignment).
export default function TitleLayout({ config }: SlideRenderInput) {
  const { title: titleStyle } = slideStyleToReactStyle(config.style)
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center gap-2 p-8">
      {config.title && (
        <h1 className="text-[2.4em] font-semibold leading-tight" style={titleStyle}>
          {config.title}
        </h1>
      )}
      {config.subtitle && <p className="text-[1.15em] text-on-surface-muted">{config.subtitle}</p>}
      <div className="flex gap-3 text-[0.85em] text-on-surface-muted mt-4">
        {config.author && <span>{config.author}</span>}
        {config.date && <span>{config.date}</span>}
      </div>
    </div>
  )
}
