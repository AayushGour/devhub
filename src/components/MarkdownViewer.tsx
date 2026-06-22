import { useEffect, useRef } from 'react'
import { parseMarkdown, postProcessPreview } from '@/features/markdown-studio/utils/parser'

interface Props {
  content: string
  className?: string
}

export default function MarkdownViewer({ content, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = parseMarkdown(content)
    postProcessPreview(ref.current)
  }, [content])

  return <div ref={ref} className={`markdown-preview ${className ?? ''}`} />
}
