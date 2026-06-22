import * as pdfjs from 'pdfjs-dist'

// Use CDN worker URL to avoid Vite's ?import transformation breaking the worker load
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

export type ExtractionStatusCallback = (status: string) => void

async function extractPdf(file: File, onStatus: ExtractionStatusCallback): Promise<string> {
  onStatus('loading PDF…')
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages
  const pageTexts: string[] = []

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onStatus(`extracting page ${pageNum}/${totalPages}…`)
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const items = textContent.items as Array<{ str: string; transform: number[] }>
    let lastY: number | null = null
    let pageText = ''
    for (const item of items) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(lastY - y) > 5) pageText += '\n'
      pageText += item.str
      lastY = y
    }
    pageTexts.push(pageText.trim())
    page.cleanup()
  }

  pdf.destroy()
  onStatus('PDF extraction complete')
  return pageTexts.join('\n\n')
}

async function extractDocx(file: File, onStatus: ExtractionStatusCallback): Promise<string> {
  onStatus('loading DOCX…')
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  onStatus('extracting DOCX text…')
  const result = await mammoth.extractRawText({ arrayBuffer })
  if (result.messages.length > 0) console.warn('[RAG:extract] mammoth warnings:', result.messages)
  onStatus('DOCX extraction complete')
  return result.value
}

export async function extractText(file: File, onStatus: ExtractionStatusCallback): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return extractPdf(file, onStatus)
    case 'docx':
      return extractDocx(file, onStatus)
    case 'txt':
    case 'md':
      onStatus('reading file…')
      return file.text()
    default:
      throw new Error(`Unsupported file type: .${ext}`)
  }
}
