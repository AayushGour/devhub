import { useState, useCallback, useRef, useEffect } from 'react'
import { fileToCanvas } from '../utils/canvas'
import { runSvgo, formatSvg, svgStats, type SvgStats } from '../utils/postprocess'
import { ENGINES, PRESETS, getPreset } from '../engines'
import { createLogger } from '@/lib/logger'
import type { EnginePreset, TraceParams } from '../engines/types'

const log = createLogger('svg')

export type Phase = 'idle' | 'processing' | 'gallery' | 'done'

export type TileState =
  | { status: 'pending' }
  | { status: 'done'; svg: string; stats: SvgStats }
  | { status: 'failed'; error: string }

const REFINE_DEBOUNCE = 250

export interface SvgStudioState {
  phase: Phase
  file: File | null
  presets: EnginePreset[]
  tiles: Record<string, TileState>
  activeId: string | null
  activePreset: EnginePreset | null
  params: Record<string, TraceParams>
  activeSvg: string | null
  error: string | null
  refining: boolean
  handleFile: (file: File) => void
  selectTile: (id: string) => void
  backToGallery: () => void
  editSvg: (svg: string) => void
  refine: (id: string, knobId: string, value: number) => void
}

async function runTrace(
  preset: EnginePreset,
  canvas: HTMLCanvasElement,
  file: File,
  params: TraceParams
): Promise<TileState> {
  const raw = await ENGINES[preset.engine]({ canvas, file }, params)
  const svg = preset.engine === 'embed' ? formatSvg(raw) : formatSvg(runSvgo(raw))
  return { status: 'done', svg, stats: svgStats(svg) }
}

export function useSvgStudio(): SvgStudioState {
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [tiles, setTiles] = useState<Record<string, TileState>>({})
  const [params, setParams] = useState<Record<string, TraceParams>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editedSvg, setEditedSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refining, setRefining] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reqIds = useRef<Record<string, number>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Bumped per upload; in-flight traces from a previous file are discarded.
  const runId = useRef(0)
  // Authoritative copy of params so refine can read the latest synchronously.
  const paramsRef = useRef<Record<string, TraceParams>>({})
  // Lets the async refine callback read the latest activeId without re-subscribing.
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const handleFile = useCallback(async (f: File) => {
    const myRun = ++runId.current
    log.log(`handleFile: ${f.name} (${f.type}, ${f.size} bytes)`)
    setFile(f)
    setPhase('processing')
    setError(null)
    setActiveId(null)
    setEditedSvg(null)
    setRefining(false)
    canvasRef.current = null

    const initialParams: Record<string, TraceParams> = {}
    const initialTiles: Record<string, TileState> = {}
    for (const p of PRESETS) {
      initialParams[p.id] = { ...p.defaults }
      initialTiles[p.id] = { status: 'pending' }
    }
    paramsRef.current = initialParams
    setParams(initialParams)
    setTiles(initialTiles)

    let canvas: HTMLCanvasElement
    try {
      canvas = await fileToCanvas(f)
    } catch (e) {
      if (myRun !== runId.current) return
      log.error('fileToCanvas failed', e)
      setError((e as Error).message)
      setPhase('idle')
      return
    }
    if (myRun !== runId.current) return // superseded by a newer upload
    canvasRef.current = canvas
    setPhase('gallery')

    // Progressive: each preset fills its own tile as it resolves.
    for (const preset of PRESETS) {
      runTrace(preset, canvas, f, initialParams[preset.id])
        .then(tile => {
          if (myRun !== runId.current) return
          setTiles(prev => ({ ...prev, [preset.id]: tile }))
        })
        .catch(e => {
          if (myRun !== runId.current) return
          log.error(`trace failed [${preset.label}]`, e)
          setTiles(prev => ({
            ...prev,
            [preset.id]: { status: 'failed', error: (e as Error).message },
          }))
        })
    }
  }, [])

  const selectTile = useCallback((id: string) => {
    setActiveId(id)
    setEditedSvg(null)
    setPhase('done')
  }, [])

  const backToGallery = useCallback(() => {
    setPhase('gallery')
  }, [])

  const editSvg = useCallback((svg: string) => {
    setEditedSvg(svg)
  }, [])

  const refine = useCallback((id: string, knobId: string, value: number) => {
    const canvas = canvasRef.current
    const preset = getPreset(id)
    const f = file
    if (!canvas || !preset || !f) return

    // Update params from the authoritative ref (no side effects in the updater).
    const nextParams = { ...paramsRef.current[id], [knobId]: value }
    paramsRef.current = { ...paramsRef.current, [id]: nextParams }
    setParams(paramsRef.current)

    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => {
      const myRun = runId.current
      const reqId = (reqIds.current[id] ?? 0) + 1
      reqIds.current[id] = reqId
      const fresh = () => reqIds.current[id] === reqId && myRun === runId.current
      setRefining(true)
      runTrace(preset, canvas, f, nextParams)
        .then(tile => {
          if (!fresh()) return
          setTiles(prevTiles => ({ ...prevTiles, [id]: tile }))
          setEditedSvg(prevEdited => (id === activeIdRef.current ? null : prevEdited))
        })
        .catch(e => {
          if (!fresh()) return
          log.error(`refine failed [${id}]`, e)
          setTiles(prevTiles => ({
            ...prevTiles,
            [id]: { status: 'failed', error: (e as Error).message },
          }))
        })
        .finally(() => {
          if (fresh()) setRefining(false)
        })
    }, REFINE_DEBOUNCE)
  }, [file])

  const activePreset = activeId ? getPreset(activeId) ?? null : null
  const activeTile = activeId ? tiles[activeId] : undefined
  const activeSvg =
    editedSvg ?? (activeTile && activeTile.status === 'done' ? activeTile.svg : null)

  return {
    phase,
    file,
    presets: PRESETS,
    tiles,
    activeId,
    activePreset,
    params,
    activeSvg,
    error,
    refining,
    handleFile,
    selectTile,
    backToGallery,
    editSvg,
    refine,
  }
}
