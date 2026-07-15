// Shared overflow measure/scale util — ONE implementation reused by both the
// preview stack (SlideCard) and the export print doc (slideExport.ts), so preview
// and export overflow behavior never diverge (project-context.md AC).

export const OVERFLOW_SCALE_FLOOR = 0.6

export interface OverflowResult {
  scale: number
  clipped: boolean
}

/**
 * Measures `contentEl`'s natural (unscaled) height against a fixed box height and
 * returns the scale factor to apply via `transform: scale(f)`.
 *
 * - No overflow: scale 1, not clipped.
 * - Overflow, scale-to-fit stays >= OVERFLOW_SCALE_FLOOR: scale = boxHeightPx / contentHeight.
 * - Overflow so severe the fitted scale would go below the floor: scale is floored at
 *   OVERFLOW_SCALE_FLOOR and `clipped: true` — caller applies `overflow: hidden` on the
 *   box so remaining content clips at the bounds instead of shrinking further or growing
 *   the page.
 *
 * Pure enough to unit test with a stubbed `scrollHeight` (jsdom doesn't lay out real
 * heights, so callers/tests set `contentEl.scrollHeight` directly via defineProperty).
 */
export function measureAndScale(contentEl: HTMLElement, boxHeightPx: number): OverflowResult {
  const contentHeight = contentEl.scrollHeight
  if (!contentHeight || !boxHeightPx || contentHeight <= boxHeightPx) {
    return { scale: 1, clipped: false }
  }

  const fitted = boxHeightPx / contentHeight
  if (fitted >= OVERFLOW_SCALE_FLOOR) {
    return { scale: fitted, clipped: false }
  }
  return { scale: OVERFLOW_SCALE_FLOOR, clipped: true }
}
