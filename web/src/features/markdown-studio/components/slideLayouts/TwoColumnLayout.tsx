import type { SlideRenderInput } from '../../utils/slideParser'
import { slideStyleToReactStyle } from '../../utils/slideStyle'

// Two-column layout: optional title + 2-col grid of markdown columns. Ignores body.
// Applies per-slide title/body styling to title and column wrappers.
export default function TwoColumnLayout({ config, columnsHtml }: SlideRenderInput) {
  const { title: titleStyle, body: bodyStyle } = slideStyleToReactStyle(config.style)
  const [left, right] = columnsHtml ?? ['', '']
  return (
    <div className="flex flex-1 flex-col p-8 gap-3 overflow-hidden">
      {config.title && (
        <h2 className="text-[1.55em] font-semibold leading-tight" style={titleStyle}>
          {config.title}
        </h2>
      )}
      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="markdown-preview" style={bodyStyle} dangerouslySetInnerHTML={{ __html: left }} />
        <div className="markdown-preview" style={bodyStyle} dangerouslySetInnerHTML={{ __html: right }} />
      </div>
    </div>
  )
}
