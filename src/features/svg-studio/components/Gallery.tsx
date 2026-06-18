import Tile from './Tile'
import type { EnginePreset } from '../engines/types'
import type { TileState } from '../hooks/useSvgStudio'

interface Props {
  presets: EnginePreset[]
  tiles: Record<string, TileState>
  activeId: string | null
  onSelect: (id: string) => void
}

export default function Gallery({ presets, tiles, activeId, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold text-on-surface">Choose a result</h2>
          <p className="text-[12px] text-on-surface-muted mt-0.5">
            Each engine traces independently — pick one to refine. Stats show how minimal each output is.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {presets.map(preset => (
            <Tile
              key={preset.id}
              preset={preset}
              state={tiles[preset.id] ?? { status: 'pending' }}
              active={activeId === preset.id}
              onSelect={() => onSelect(preset.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
