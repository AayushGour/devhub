import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { parseCsv } from '@/lib/csv'

const ROW_HEIGHT = 28
const MIN_COL_WIDTH = 80
const MAX_COL_WIDTH = 400
const WIDTH_SAMPLE_SIZE = 200

type SortDir = 'asc' | 'desc'

export default function CsvView({ text }: { text: string }) {
  const { headers, rows, error } = useMemo(() => parseCsv(text), [text])
  const [sort, setSort] = useState<{ col: number; dir: SortDir } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const colWidths = useMemo(() => {
    const sample = rows.slice(0, WIDTH_SAMPLE_SIZE)
    return headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...sample.map((r) => r[i]?.length ?? 0))
      return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxLen * 7 + 28))
    })
  }, [headers, rows])
  const gridTemplateColumns = colWidths.map((w) => `${w}px`).join(' ')
  const totalWidth = colWidths.reduce((a, w) => a + w, 0)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const { col, dir } = sort
    const allNumeric = rows.every((r) => r[col] === '' || !Number.isNaN(Number(r[col])))
    const cmp = allNumeric
      ? (a: string[], b: string[]) => Number(a[col]) - Number(b[col])
      : (a: string[], b: string[]) => a[col].localeCompare(b[col])
    const sorted = [...rows].sort(cmp)
    return dir === 'asc' ? sorted : sorted.reverse()
  }, [rows, sort])

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const toggleSort = (col: number) => {
    setSort((prev) => {
      if (prev?.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  if (!headers.length) {
    return <div className="p-4 text-xs text-on-surface-muted">No data</div>
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="preview-toolbar shrink-0 flex items-center gap-3 px-3 h-9 border-b border-border bg-surface-raised text-xs text-on-surface-muted">
        <span>{sortedRows.length.toLocaleString()} rows</span>
        <span>{headers.length.toLocaleString()} columns</span>
      </div>
      {error && (
        <div className="px-3 py-1.5 text-xs text-amber-500 font-mono border-b border-border shrink-0">
          {error}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div
          className="sticky top-0 z-10 grid bg-surface-raised"
          style={{ gridTemplateColumns, width: totalWidth }}
        >
          {headers.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleSort(i)}
              className="flex items-center gap-1 px-3 py-1.5 text-left text-xs font-mono font-medium text-on-surface border-b border-border cursor-pointer select-none hover:bg-surface-hover whitespace-nowrap overflow-hidden"
            >
              <span className="truncate">{h || `col${i + 1}`}</span>
              {sort?.col === i ? (
                sort.dir === 'asc' ? (
                  <ArrowUp size={11} className="shrink-0" />
                ) : (
                  <ArrowDown size={11} className="shrink-0" />
                )
              ) : (
                <ArrowUpDown size={11} className="shrink-0 opacity-30" />
              )}
            </button>
          ))}
        </div>
        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize(), width: totalWidth }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = sortedRows[vi.index]
            return (
              <div
                key={vi.key}
                className="absolute left-0 top-0 grid hover:bg-surface-hover"
                style={{
                  gridTemplateColumns,
                  width: totalWidth,
                  height: ROW_HEIGHT,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {row.map((cell, ci) => (
                  <div
                    key={ci}
                    title={cell}
                    className="px-3 py-1.5 text-xs font-mono text-on-surface border-b border-border truncate"
                  >
                    {cell}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
