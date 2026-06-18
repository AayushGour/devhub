import { useState, useCallback } from 'react'
import {
  fileToCanvas,
  traceDetailed,
  traceSimplified,
  buildEmbedSvg,
  formatSvg,
  minifySvg,
} from '../utils/converters'

export type Phase = 'idle' | 'processing' | 'comparing' | 'done'
export type MethodLabel = 'Detailed' | 'Simplified' | 'Embed'

export interface CompareOption {
  svg: string
  label: MethodLabel
  failed?: boolean
}

interface CompareResults {
  a: CompareOption
  b: CompareOption
}

export interface SvgStudioState {
  phase: Phase
  file: File | null
  compare: CompareResults | null
  activeSvg: string | null
  activeLabel: MethodLabel | null
  embedSvg: string | null
  error: string | null
  handleFile: (file: File) => void
  editSvg: (svg: string) => void
  selectMethod: (method: 'A' | 'B') => void
  switchToEmbed: () => void
  switchToVector: () => void
}

export function useSvgStudio(): SvgStudioState {
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [compare, setCompare] = useState<CompareResults | null>(null)
  const [activeSvg, setActiveSvg] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<MethodLabel | null>(null)
  const [embedSvg, setEmbedSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Tracks last committed vector result so embed↔vector toggle doesn't re-show modal
  const [vectorSvg, setVectorSvg] = useState<string | null>(null)
  const [vectorLabel, setVectorLabel] = useState<MethodLabel | null>(null)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setPhase('processing')
    setError(null)
    setCompare(null)
    setActiveSvg(null)
    setActiveLabel(null)
    setEmbedSvg(null)
    setVectorSvg(null)
    setVectorLabel(null)

    try {
      const canvas = await fileToCanvas(f)

      const [resultA, resultB, resultEmbed] = await Promise.allSettled([
        traceDetailed(canvas).then(minifySvg).then(formatSvg),
        traceSimplified(canvas).then(minifySvg).then(formatSvg),
        buildEmbedSvg(f, canvas).then(formatSvg),
      ])

      if (resultA.status === 'rejected') console.error('[Detailed]', resultA.reason)
      if (resultB.status === 'rejected') console.error('[Simplified]', resultB.reason)

      const svgA = resultA.status === 'fulfilled' ? resultA.value : ''
      const svgB = resultB.status === 'fulfilled' ? resultB.value : ''
      const embed = resultEmbed.status === 'fulfilled' ? resultEmbed.value : ''

      if (!svgA && !svgB) {
        const msg = resultA.status === 'rejected' ? (resultA.reason as Error).message : 'Conversion failed'
        setError(msg)
        setPhase('idle')
        return
      }

      setCompare({
        a: { svg: svgA, label: 'Detailed', failed: !svgA },
        b: { svg: svgB, label: 'Simplified', failed: !svgB },
      })
      setEmbedSvg(embed)

      if (!svgA || !svgB) {
        const svg = svgA || svgB
        const label: MethodLabel = svgA ? 'Detailed' : 'Simplified'
        setActiveSvg(svg)
        setActiveLabel(label)
        setVectorSvg(svg)
        setVectorLabel(label)
        setPhase('done')
      } else {
        setPhase('comparing')
      }
    } catch (e) {
      setError((e as Error).message)
      setPhase('idle')
    }
  }, [])

  const editSvg = useCallback((svg: string) => {
    setActiveSvg(svg)
  }, [])

  const selectMethod = useCallback((method: 'A' | 'B') => {
    if (!compare) return
    const option = method === 'A' ? compare.a : compare.b
    setActiveSvg(option.svg)
    setActiveLabel(option.label)
    setVectorSvg(option.svg)
    setVectorLabel(option.label)
    setPhase('done')
  }, [compare])

  const switchToEmbed = useCallback(() => {
    if (!embedSvg) return
    setActiveSvg(embedSvg)
    setActiveLabel('Embed')
    setPhase('done')
  }, [embedSvg])

  const switchToVector = useCallback(() => {
    if (vectorSvg) {
      setActiveSvg(vectorSvg)
      setActiveLabel(vectorLabel)
      setPhase('done')
    } else if (compare) {
      setPhase('comparing')
    }
  }, [vectorSvg, vectorLabel, compare])

  return {
    phase, file, compare, activeSvg, activeLabel, embedSvg, error,
    handleFile, editSvg, selectMethod, switchToEmbed, switchToVector,
  }
}
