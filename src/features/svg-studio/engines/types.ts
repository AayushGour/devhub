export type EngineId = 'potrace' | 'potrace-color' | 'imagetracer' | 'embed'

export type ParamValue = number | string | boolean
export type TraceParams = Record<string, ParamValue>

/** Inputs available to every engine. `canvas` is already scaled to trace resolution. */
export interface TraceContext {
  canvas: HTMLCanvasElement
  file: File
}

export type TraceFn = (ctx: TraceContext, params: TraceParams) => Promise<string>

/** A single tunable parameter exposed in the refine panel. */
export interface KnobDef {
  id: string // param key passed straight to the engine
  label: string
  min: number
  max: number
  step: number
  tooltip?: string
}

export interface EnginePreset {
  id: string // stable preset id, e.g. 'mono'
  label: string
  hint: string
  engine: EngineId
  defaults: TraceParams
  knobs: KnobDef[] // empty = no refine panel
}
