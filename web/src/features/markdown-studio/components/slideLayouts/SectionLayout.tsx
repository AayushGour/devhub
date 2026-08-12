import type { SlideRenderInput } from '../../utils/slideParser'
import { slideStyleToReactStyle } from '../../utils/slideStyle'

// Section divider slide: large centered title only (section header). Ignores body.
// Applies per-slide title styling (color, fontSize, alignment).
export default function SectionLayout({ config }: SlideRenderInput) {
  const { title: titleStyle } = slideStyleToReactStyle(config.style)
  return (
    <div className="flex flex-1 items-center justify-center text-center p-8">
      {config.title && (
        <h1 className="text-[3.2em] font-bold leading-tight" style={titleStyle}>
          {config.title}
        </h1>
      )}
    </div>
  )
}
