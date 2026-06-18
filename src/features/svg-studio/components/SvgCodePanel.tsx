import Editor from '@monaco-editor/react'
import { useSettingsStore } from '@/store/settingsStore'
import { svgStats } from '../utils/converters'

interface Props {
  svg: string
  onChange: (svg: string) => void
}

const DARK_THEMES = new Set(['dark', 'github', 'nord', 'dracula'])

export default function SvgCodePanel({ svg, onChange }: Props) {
  const { theme } = useSettingsStore()
  const isDark = DARK_THEMES.has(theme)
  const stats = svgStats(svg)

  function formatBytes(n: number) {
    return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
  }

  return (
    <div className="flex flex-col border-r border-border" style={{ width: '45%' }}>
      <div className="shrink-0 h-9 flex items-center gap-3 px-3 border-b border-border bg-surface-raised">
        <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-[0.06em]">SVG Code</span>
        <div className="flex-1" />
        <span className="text-[11px] text-on-surface-muted tabular-nums">{stats.lines} lines</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-[11px] text-on-surface-muted tabular-nums">{formatBytes(stats.bytes)}</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-[11px] text-on-surface-muted tabular-nums">{stats.paths} paths</span>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          value={svg}
          language="xml"
          theme={isDark ? 'vs-dark' : 'vs'}
          onChange={v => { if (v !== undefined) onChange(v) }}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            renderLineHighlight: 'line',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            tabSize: 2,
            formatOnPaste: true,
          }}
          height="100%"
        />
      </div>
    </div>
  )
}
