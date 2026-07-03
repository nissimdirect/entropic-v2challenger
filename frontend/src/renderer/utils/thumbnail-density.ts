/**
 * Task #19 — Timeline clip thumbnail density.
 *
 * Zoomed-in clips render wider on screen (px width scales with zoom, see
 * Clip.tsx: `width = clip.duration * zoom`) and should show more granular
 * poster frames; zoomed-out (narrow) clips should show fewer. This module
 * is a pure function of clip pixel width — no DOM/store access — so it's
 * trivially unit-testable and cheap to call every render.
 *
 * Design:
 * - One thumbnail per ~THUMBNAIL_PX_PER_FRAME px of rendered clip width.
 * - Clamped to [THUMBNAIL_MIN_COUNT, THUMBNAIL_MAX_COUNT] so we never go
 *   blank at low zoom (min 1) and never ask to decode/display more frames
 *   than the backend ever fetches for a clip (App.tsx requests a fixed
 *   `count: 12` via the `thumbnails` IPC command on import) — so this
 *   never "wants" more frames than could actually be available.
 * - `selectThumbnails` evenly subsamples the available pool down to the
 *   desired count (stride-based nearest-index pick), so F-0512-8's
 *   flex-based even-distribution CSS (.clip__thumb { flex: 1 1 0 }) still
 *   spaces whatever subset is rendered uniformly across the clip width.
 */

export const THUMBNAIL_PX_PER_FRAME = 100
export const THUMBNAIL_MIN_COUNT = 1
export const THUMBNAIL_MAX_COUNT = 12

/**
 * Pure density function: clip rendered pixel width -> desired thumbnail count.
 * Monotonic non-decreasing in clipPxWidth, capped at THUMBNAIL_MAX_COUNT,
 * never below THUMBNAIL_MIN_COUNT.
 */
export function thumbnailCount(clipPxWidth: number): number {
  // NaN/non-positive widths degrade to the minimum; Infinity falls through
  // to the Math.min clamp below (still capped at THUMBNAIL_MAX_COUNT).
  if (Number.isNaN(clipPxWidth) || clipPxWidth <= 0) return THUMBNAIL_MIN_COUNT
  const raw = Math.floor(clipPxWidth / THUMBNAIL_PX_PER_FRAME)
  return Math.max(THUMBNAIL_MIN_COUNT, Math.min(THUMBNAIL_MAX_COUNT, raw))
}

/**
 * Evenly subsample `thumbnails` down to `count` items. If the pool already
 * has fewer items than `count`, returns the pool unchanged (never fabricates
 * frames). Preserves original order so the F-0512-8 even-distribution CSS
 * still lays them out left-to-right in playback order.
 */
export function selectThumbnails<T>(thumbnails: T[], count: number): T[] {
  if (count <= 0 || thumbnails.length === 0) return []
  if (thumbnails.length <= count) return thumbnails
  if (count === 1) return [thumbnails[0]]

  const result: T[] = []
  const stride = (thumbnails.length - 1) / (count - 1)
  const seen = new Set<number>()
  for (let i = 0; i < count; i++) {
    const idx = Math.round(i * stride)
    if (!seen.has(idx)) {
      seen.add(idx)
      result.push(thumbnails[idx])
    }
  }
  return result
}
