# SVG Studio — Multi-Engine Gallery + Refine

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan

## Goal

Turn SVG Studio into an image→SVG converter that produces clean, minimalistic SVG suitable for logos. Instead of a fixed 2-option A/B compare, present the user a gallery of trace results from multiple engines, show decision-aiding stats, and let the user pick one and fine-tune it with live knobs.

## Why the current approach falls short

The existing studio uses `imagetracerjs` exclusively. It is a color-region tracer (raster posterization → polygon boundaries per color layer). For logos this produces:

- Many small `<path>` elements with hundreds of nodes
- Quadratic splines (`Q`) with no curve fitting or corner detection
- Structurally bloated output that regex `minifySvg` cannot fix (it only trims attributes, not geometry)

The `traceSimplified` heuristics (`removeBackground` corner-voting, `flattenToOneColor`) are fragile and break on logos that touch edges or lack a flat background.

## Engine roster

Three trace engines plus a raster fallback. All vector output passes through SVGO for real minification.

| Preset | Engine | Dependency | Best for |
|--------|--------|-----------|----------|
| **Mono** | potrace-js (binary threshold) | `potrace-js` (ISC, pure JS) | icons, single-color marks — cleanest cubic Béziers, fewest nodes, corner detection |
| **Color** | potrace-js + palette quantize | `potrace-js` | flat multi-color brand logos — N-colour posterize, one traced layer per colour |
| **Detailed** | imagetracer | existing `imagetracerjs` | complex / gradient-ish images, fallback |
| **Embed** | raster base64 | existing | escape hatch — wraps raster in `<image>` |

**Engine decision (revised after implementation):** VTracer was dropped first (`@neplex/vectorizer` is a Node-native napi addon; `vtracer-wasm` is proprietary/unmaintained). The initial replacement, `esm-potrace-wasm`, was then also dropped: its Emscripten build has a 64 KB stack and copies the whole RGBA image onto it via `ccall("array")`/`stackAlloc`, so any image above ~100 px throws `RangeError: offset is out of bounds` (confirmed at the latest version 0.4.4; same flaw in the upstream `potrace-wasm` it forks). The wasm-potrace route is unusable in-browser.

Final engine is **`potrace-js`** — a pure-JS port of Selinger/kilobtye potrace, **ISC-licensed** (permissive, no copyleft) with no wasm and no stack limit. The studio builds 1-bit `Bitmap`s directly:
- **Mono:** luminance threshold (the `threshold` knob) → one `Bitmap` → `traceBitmap` → one `<path fill-rule="evenodd">`.
- **Color:** quantize opaque pixels to the N most-frequent colours (5-bit/channel buckets, nearest-colour assignment) → one `Bitmap` + `traceBitmap` per colour → layered `<path>`s, largest coverage first.

`potrace-js`'s bundled `getSVG` hardcodes dimensions and is unused; the studio serializes curves itself with the real `viewBox`. Net new deps: `potrace-js` + `svgo`. Imported via the `potrace-js/src/index.js` subpath (its `main` points at a non-shipped `lib/`); Vite resolves the source's extensionless imports.

`svgo` (browser build) post-processes every vector result: `mergePaths`, `convertPathData` (round coords, shortest rel/abs form), `convertColors` (rgb→hex), `removeDimensions`, `removeUselessStrokeAndFill`, `cleanupNumericValues`. This replaces the hand-rolled regex `minifySvg` and the manual `normalizeSvgForDisplay` width/height stripping.

Engines are lazy-imported per use (following the existing `getImageTracer()` dynamic-import pattern) so bundle weight is paid only when an engine runs.

### Tracing resolution

Trace at a higher input resolution (~1500px max dimension, up from current 800px). Output is vector and resolution-independent; a larger input bitmap yields smoother potrace/VTracer curves while SVGO keeps the output bytes small. The `removeBackground` / `flattenToOneColor` heuristics are dropped — potrace handles thresholding natively, VTracer handles color clustering natively.

## Data model

Presets are data, not branching code. Each preset declares its engine, default params, and which knobs the refine panel exposes.

```ts
type EngineId = 'potrace' | 'potrace-color' | 'imagetracer' | 'embed'

interface KnobDef {
  id: string          // param key passed to the engine
  label: string       // "Despeckle"
  min: number
  max: number
  step: number
}

interface EnginePreset {
  id: string          // 'mono'
  label: string       // "Mono"
  hint: string        // "single-color, fewest nodes"
  engine: EngineId
  defaults: Record<string, number | string>
  knobs: KnobDef[]    // empty = no refine panel (embed)
}
```

### Knobs per engine

Knobs map directly to engine parameters.

- **Mono (potrace-js):** Threshold (luminance cutoff) · Despeckle (`turdsize`) · Corner sharpness (`alphamax`) · Smoothing (`opttolerance`)
- **Color (potrace-js):** Colors (palette size) · Despeckle (`turdsize`) · Corner sharpness (`alphamax`) · Smoothing (`opttolerance`)
- **Detailed (imagetracer):** Color count (`numberofcolors`) · Path omit (`pathomit`)
- **Embed:** none

## Module structure

Each engine is an isolated module exposing one pure function:

```
src/features/svg-studio/
  engines/
    potrace.ts        // trace(canvas, params): Promise<string>  (mono + color posterize)
    imagetracer.ts    // trace(canvas, params): Promise<string>  (extracted from converters.ts)
    embed.ts          // trace(file, canvas): Promise<string>
    index.ts          // EngineId → { trace, preset }; PRESETS array
  utils/
    postprocess.ts    // runSvgo(svg), formatSvg, svgStats
    canvas.ts         // fileToCanvas (1500px), retained helpers
  hooks/useSvgStudio.ts
  components/
    Gallery.tsx       // grid of tiles
    Tile.tsx          // preview + stats badge + select
    RefinePanel.tsx   // knobs for the active preset
    SvgPreviewPanel.tsx / SvgCodePanel.tsx  (retained)
```

`converters.ts` is decomposed: tracing logic moves into the per-engine modules; SVGO/format/stats move into `postprocess.ts`. The fragile `minifySvg`, `removeBackground`, `flattenToOneColor` are removed. `CompareModal.tsx` is replaced by `Gallery.tsx` + `RefinePanel.tsx`.

## State machine and flow

The gallery holds a map `presetId → TileState`:

```ts
type TileState =
  | { status: 'pending' }
  | { status: 'done'; svg: string; stats: SvgStats }
  | { status: 'failed'; error: string }
```

`SvgStats = { bytes, paths, nodes }`.

**Flow:**

1. **Upload** → `fileToCanvas` (≈1500px) → all presets fire concurrently via `Promise.allSettled`. Each resolves into its own tile independently (progressive fill — spinner → result), so the gallery never blocks on the slowest engine.
2. **Select** → clicking a tile makes it active: opens in the editor/preview and shows the refine panel populated with that preset's knobs at their current values.
3. **Refine** → dragging a knob triggers a debounced (~250ms) re-trace of *that one engine* with the new params → SVGO → updates the active preview and stats live. Per-preset knob state persists, so switching tiles preserves tweaks.

**Realtime behavior:** knob changes update the preview in under ~1s for most logos. potrace and imagetracer are fast (feels live); VTracer color is slower, so a spinner overlay shows on the preview during its re-trace. Debounced and live, not instant-per-keystroke and not frozen.

**Cancellation:** each re-trace carries a monotonically increasing request id; results from a superseded request are discarded so rapid knob drags never cause the preview to flicker backwards.

## Decision aids

Every tile and the active view show a **bytes · paths · nodes** badge — the user's primary signal for "most minimal." Tiles may optionally be sorted by byte size so the smallest clean result surfaces first.

## Error handling

- A failed engine sets its tile to `failed` with the error message; other tiles are unaffected (progressive `allSettled` already isolates failures).
- If every engine fails, surface the first error and return to the idle/upload state (mirrors current behavior).
- Image load failure (`fileToCanvas`) rejects with "Failed to load image" and returns to idle.
- A re-trace failure during refine shows an inline error on the refine panel and keeps the last good preview.

## Testing

- **Engine modules:** each `trace(canvas, params)` is pure — unit-test against a small fixture canvas, assert it returns valid SVG (parses, has `<svg>` root, expected `<path>` count range).
- **postprocess:** SVGO wrapper given known-bloated input returns smaller, still-valid SVG; `svgStats` counts bytes/paths/nodes correctly.
- **Preset registry:** every `EngineId` resolves to a `trace` fn; every knob `id` is a real param for its engine.
- **Hook state:** simulate upload → assert all tiles transition pending → done/failed; select → active set; knob change → debounced re-trace fires once with latest params; stale request ids discarded.

## Out of scope (YAGNI)

- Manual path editing beyond the existing code editor
- Saving/exporting preset configs
- Batch conversion of multiple images
- Server-side tracing
