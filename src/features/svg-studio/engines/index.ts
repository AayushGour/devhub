import type { EngineId, EnginePreset, TraceFn } from './types'
import { traceMono, traceColor } from './potrace'
import { trace as imagetracerTrace } from './imagetracer'
import { trace as embedTrace } from './embed'

export const ENGINES: Record<EngineId, TraceFn> = {
  potrace: traceMono,
  'potrace-color': traceColor,
  imagetracer: imagetracerTrace,
  embed: embedTrace,
}

export const PRESETS: EnginePreset[] = [
  {
    id: 'mono',
    label: 'Mono',
    hint: 'Single color — fewest nodes, cleanest curves',
    engine: 'potrace',
    defaults: { threshold: 128, turdsize: 2, alphamax: 1, opttolerance: 0.2 },
    knobs: [
      { id: 'threshold', label: 'Threshold', min: 1, max: 254, step: 1 },
      { id: 'turdsize', label: 'Despeckle', min: 0, max: 10, step: 1 },
      { id: 'alphamax', label: 'Corner sharpness', min: 0, max: 1.33, step: 0.05 },
      { id: 'opttolerance', label: 'Smoothing', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'color',
    label: 'Color',
    hint: 'Posterized color layers — flat multi-color logos',
    engine: 'potrace-color',
    defaults: { colorcount: 5, turdsize: 2, alphamax: 1, opttolerance: 0.2 },
    knobs: [
      { id: 'colorcount', label: 'Colors', min: 2, max: 8, step: 1 },
      { id: 'turdsize', label: 'Despeckle', min: 0, max: 10, step: 1 },
      { id: 'alphamax', label: 'Corner sharpness', min: 0, max: 1.33, step: 0.05 },
      { id: 'opttolerance', label: 'Smoothing', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'detailed',
    label: 'Detailed',
    hint: 'Full-color regions — complex or gradient images',
    engine: 'imagetracer',
    defaults: { numberofcolors: 16, pathomit: 8 },
    knobs: [
      { id: 'numberofcolors', label: 'Colors', min: 2, max: 32, step: 1 },
      { id: 'pathomit', label: 'Path omit', min: 0, max: 32, step: 1 },
    ],
  },
  {
    id: 'embed',
    label: 'Embed',
    hint: 'Raster fallback — original image inside an SVG',
    engine: 'embed',
    defaults: {},
    knobs: [],
  },
]

export function getPreset(id: string): EnginePreset | undefined {
  return PRESETS.find(p => p.id === id)
}
