import { CodeEditor } from '@/components/ui/CodeEditor'
import { svgStats } from '../utils/postprocess'

interface Props {
  svg: string
  onChange: (svg: string) => void
}

export default function SvgCodePanel({ svg, onChange }: Props) {
  const stats = svgStats(svg)

  function formatBytes(n: number) {
    return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
  }

  return (
    <div className="flex flex-col border-r border-border w-[45%]">
      <div className="shrink-0 h-9 flex items-center gap-3 px-3 border-b border-border bg-surface-raised">
        <span className="text-[0.69rem] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">SVG Code</span>
        <div className="flex-1" />
        <span className="text-[0.69rem] text-on-surface-muted tabular-nums">{stats.lines} lines</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-[0.69rem] text-on-surface-muted tabular-nums">{formatBytes(stats.bytes)}</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-[0.69rem] text-on-surface-muted tabular-nums">{stats.paths} paths</span>
      </div>

      <div className="flex-1 min-h-0">
        <CodeEditor
          className="h-full"
          value={svg}
          language="xml"
          onChange={v => { if (v !== undefined) onChange(v) }}
          options={{
            fontSize: 11,
            lineNumbers: 'on',
            wordWrap: 'off',
            renderLineHighlight: 'line',
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            tabSize: 2,
            formatOnPaste: true,
          }}
        />
      </div>
    </div>
  )
}
