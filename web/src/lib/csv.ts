import Papa from 'papaparse'

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  /** Non-blocking note about ragged rows or quoting oddities — rows still render. */
  error?: string
}

/** Parses CSV/TSV text, auto-detecting the delimiter. First row is treated as the header. */
export function parseCsv(text: string): ParsedCsv {
  if (!text.trim()) return { headers: [], rows: [] }

  const result = Papa.parse<string[]>(text, {
    delimiter: '',
    skipEmptyLines: true,
  })

  const [headerRow, ...dataRows] = result.data
  if (!headerRow) return { headers: [], rows: [] }

  const colCount = Math.max(headerRow.length, ...dataRows.map((r) => r.length))
  const pad = (row: string[]) =>
    row.length < colCount ? [...row, ...Array(colCount - row.length).fill('')] : row

  // FieldMismatch (ragged rows) is common and already handled by padding — only
  // surface the rarer quote/delimiter warnings as a heads-up.
  const notable = result.errors.find((e) => e.type !== 'FieldMismatch')

  return {
    headers: pad(headerRow),
    rows: dataRows.map(pad),
    error: notable ? `Row ${notable.row! + 1}: ${notable.message}` : undefined,
  }
}
