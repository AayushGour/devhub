import { useState, useCallback, useRef } from 'react'
import type { OutputFormat } from '../utils/formatInfo'
import { convertImage } from '../utils/converters'

export interface ResizeOpts {
  width: string
  height: string
  maintainAspectRatio: boolean
}

export interface ImageItem {
  id: string
  file: File
  originalUrl: string
  outputFormat: OutputFormat
  quality: number
  resize: ResizeOpts
  status: 'pending' | 'converting' | 'done' | 'error'
  outputBlob: Blob | null
  outputUrl: string | null
  originalSize: number
  outputSize: number | null
  error: string | null
}

export interface GlobalSettings {
  format: OutputFormat
  quality: number
  resize: ResizeOpts
}

const DEFAULT_RESIZE: ResizeOpts = { width: '', height: '', maintainAspectRatio: true }

function makeId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function revokeItem(item: ImageItem) {
  URL.revokeObjectURL(item.originalUrl)
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl)
}

export function useImageStudio() {
  const [items, setItems] = useState<ImageItem[]>([])
  const itemsRef = useRef<ImageItem[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'before' | 'after'>('after')

  const [global, setGlobal] = useState<GlobalSettings>({
    format: 'jpeg',
    quality: 85,
    resize: DEFAULT_RESIZE,
  })
  const globalRef = useRef(global)
  globalRef.current = global

  // Keeps itemsRef in sync with every state update
  const syncItems = useCallback((updater: (prev: ImageItem[]) => ImageItem[]) => {
    setItems(prev => {
      const next = updater(prev)
      itemsRef.current = next
      return next
    })
  }, [])

  const patchItem = useCallback((id: string, patch: Partial<ImageItem>) => {
    syncItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }, [syncItems])

  const patchItemSettings = useCallback((
    id: string,
    patch: Partial<Pick<ImageItem, 'outputFormat' | 'quality' | 'resize'>>
  ) => {
    syncItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const wasConverted = item.status === 'done'
      return {
        ...item,
        ...patch,
        ...(wasConverted ? {
          status: 'pending' as const,
          outputBlob: null,
          outputUrl: null,
          outputSize: null,
        } : {}),
      }
    }))
  }, [syncItems])

  const convertItem = useCallback(async (id: string) => {
    const item = itemsRef.current.find(i => i.id === id)
    if (!item || item.status === 'converting') return

    patchItem(id, { status: 'converting', error: null })

    try {
      const blob = await convertImage(item.file, {
        format: item.outputFormat,
        quality: item.quality,
        width: item.resize.width ? parseInt(item.resize.width) : undefined,
        height: item.resize.height ? parseInt(item.resize.height) : undefined,
        maintainAspectRatio: item.resize.maintainAspectRatio,
      })
      const url = URL.createObjectURL(blob)
      patchItem(id, { status: 'done', outputBlob: blob, outputUrl: url, outputSize: blob.size })
    } catch (e) {
      patchItem(id, { status: 'error', error: (e as Error).message })
    }
  }, [patchItem])

  const convertAll = useCallback(() => {
    const toConvert = itemsRef.current.filter(i => i.status === 'pending' || i.status === 'error')
    toConvert.forEach(item => void convertItem(item.id))
  }, [convertItem])

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return
    const g = globalRef.current
    const newItems: ImageItem[] = files.map(file => ({
      id: makeId(),
      file,
      originalUrl: URL.createObjectURL(file),
      outputFormat: g.format,
      quality: g.quality,
      resize: { ...g.resize },
      status: 'pending',
      outputBlob: null,
      outputUrl: null,
      originalSize: file.size,
      outputSize: null,
      error: null,
    }))
    syncItems(prev => [...prev, ...newItems])
    setSelectedId(newItems[0].id)
  }, [syncItems])

  const downloadItem = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id)
    if (!item?.outputUrl || !item.outputBlob) return
    const baseName = item.file.name.replace(/\.[^.]+$/, '')
    const ext = item.outputFormat === 'jpeg' ? 'jpg' : item.outputFormat
    const a = document.createElement('a')
    a.href = item.outputUrl
    a.download = `${baseName}.${ext}`
    a.click()
  }, [])

  const downloadZip = useCallback(async () => {
    const done = itemsRef.current.filter(i => i.status === 'done' && i.outputBlob)
    if (!done.length) return
    const { zipSync } = await import('fflate')
    const fileMap: Record<string, Uint8Array> = {}
    for (const item of done) {
      const buf = await item.outputBlob!.arrayBuffer()
      const baseName = item.file.name.replace(/\.[^.]+$/, '')
      const ext = item.outputFormat === 'jpeg' ? 'jpg' : item.outputFormat
      fileMap[`${baseName}.${ext}`] = new Uint8Array(buf)
    }
    const zipped = zipSync(fileMap)
    const blob = new Blob([zipped], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'converted-images.zip'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const removeItem = useCallback((id: string) => {
    syncItems(prev => {
      const item = prev.find(i => i.id === id)
      if (item) revokeItem(item)
      return prev.filter(i => i.id !== id)
    })
    setSelectedId(prev => prev === id ? null : prev)
  }, [syncItems])

  const clearAll = useCallback(() => {
    syncItems(prev => { prev.forEach(revokeItem); return [] })
    setSelectedId(null)
  }, [syncItems])

  const applyGlobalToAll = useCallback(() => {
    const g = globalRef.current
    syncItems(prev => prev.map(item => {
      const wasConverted = item.status === 'done'
      return {
        ...item,
        outputFormat: g.format,
        quality: g.quality,
        resize: { ...g.resize },
        ...(wasConverted ? {
          status: 'pending' as const,
          outputBlob: null,
          outputUrl: null,
          outputSize: null,
        } : {}),
      }
    }))
  }, [syncItems])

  return {
    items,
    selectedId,
    selectedItem: items.find(i => i.id === selectedId) ?? null,
    viewMode,
    global,
    setViewMode,
    setGlobal,
    setSelectedId,
    addFiles,
    patchItemSettings,
    convertItem,
    convertAll,
    downloadItem,
    downloadZip,
    removeItem,
    clearAll,
    applyGlobalToAll,
  }
}
