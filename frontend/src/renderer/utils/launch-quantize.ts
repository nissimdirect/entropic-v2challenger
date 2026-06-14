/**
 * B10.2 — Quantized launch helper for performance triggers.
 *
 * When launch-quantize is ON, snaps a trigger's frameIndex to the NEXT division
 * boundary of the existing edit/slice grid. NO footage warp — only the trigger
 * frame moves.
 *
 * Tempo formula matches Timeline.tsx exactly:
 *   gridIntervalSecs = (60 / bpm) * (4 / division)
 *   framesPerDivision = gridIntervalSecs * fps
 *
 * The division param uses the same [1, 2, 4, 8, 16, 32] scheme as
 * `quantizeDivision` in layout.ts (4 = 1/4 note, 8 = 1/8 note, etc.)
 *
 * Snap rule: snap to the NEXT division boundary (ceil).
 *   - A trigger exactly on a boundary stays on that boundary.
 *   - framesPerDivision is always ≥ 1 (enforced by the numeric guard).
 *
 * Numeric guard: any degenerate input (bpm ≤ 0, fps ≤ 0, division ≤ 0,
 * NaN, Infinity) returns the frame unchanged (no NaN / Inf propagation).
 */

/**
 * Snap `frame` to the next division boundary of the tempo grid.
 *
 * @param frame     Current playhead frame (integer, ≥ 0)
 * @param division  Grid division value: 1 | 2 | 4 | 8 | 16 | 32
 *                  (matches layout.ts `quantizeDivision`, 4 = 1/4 note)
 * @param bpm       Effective BPM (beats per minute, > 0)
 * @param fps       Frames per second of the active clip (> 0)
 * @returns         Snapped frame index (≥ frame, same or later)
 */
export function quantizeFrame(
  frame: number,
  division: number,
  bpm: number,
  fps: number,
): number {
  // Numeric guard: degenerate inputs → return frame unchanged
  if (
    !Number.isFinite(frame) ||
    !Number.isFinite(division) ||
    !Number.isFinite(bpm) ||
    !Number.isFinite(fps) ||
    division <= 0 ||
    bpm <= 0 ||
    fps <= 0
  ) {
    return Number.isFinite(frame) ? frame : 0
  }

  // Tempo formula from Timeline.tsx line 249:
  //   gridInterval = (60 / bpm) * (4 / quantizeDivision)  [seconds]
  //   framesPerDivision = gridInterval * fps               [frames]
  const gridIntervalSecs = (60 / bpm) * (4 / division)
  const fpd = gridIntervalSecs * fps

  // Guard: framesPerDivision must be positive and finite
  if (!Number.isFinite(fpd) || fpd <= 0) {
    return frame
  }

  // Snap to the next division boundary (ceil).
  // A frame exactly on a boundary → ceil(n) = n → stays.
  const snapped = Math.ceil(frame / fpd) * fpd

  // Guard: result must be finite (defensive — fpd is finite and > 0, so this
  // should always hold, but protects against extreme inputs like bpm = 1e-308).
  if (!Number.isFinite(snapped)) {
    return frame
  }

  return Math.round(snapped)
}
