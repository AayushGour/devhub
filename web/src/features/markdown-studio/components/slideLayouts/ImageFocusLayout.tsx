import type { SlideRenderInput } from '../../utils/slideParser'
import { slideStyleToReactStyle } from '../../utils/slideStyle'

// Image-focus layout: optional title + large image (with optional caption) + optional side body.
// Image may be missing — must not render broken img in that case. Applies per-slide styling.
export default function ImageFocusLayout({ config, bodyHtml, captionHtml }: SlideRenderInput) {
  const { title: titleStyle, body: bodyStyle } = slideStyleToReactStyle(config.style)
  return (
    <div className="flex flex-1 flex-col p-8 gap-3 overflow-hidden">
      {config.title && (
        <h2 className="text-[1.55em] font-semibold leading-tight" style={titleStyle}>
          {config.title}
        </h2>
      )}
      <div className="flex flex-1 gap-6 items-center">
        {config.image && (
          <div className="flex-1 flex flex-col gap-2 items-center">
            <img src={config.image} alt={config.caption ?? ''} className="max-h-full max-w-full object-contain" />
            {captionHtml && (
              <div className="markdown-preview text-[0.85em]" style={bodyStyle} dangerouslySetInnerHTML={{ __html: captionHtml }} />
            )}
          </div>
        )}
        {bodyHtml && (
          <div className="flex-1 markdown-preview" style={bodyStyle} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        )}
      </div>
    </div>
  )
}
