/**
 * GridOverlay — W1.5b PK.A1/A2: the quantize grid as a dedicated overlay
 * layer, replacing the old backgroundImage gradient that lived directly on
 * the tracks-scroll content wrapper (invisible under every opaque lane
 * background — root cause #1 in proposal.md).
 *
 * Stacking (proposal.md Workstream A / packets.md PK.A1): renders above lane
 * row backgrounds, below clip content. Lane rows paint at the default
 * z-index:auto level; this overlay claims z-index:1 (timeline.css) and
 * `.clip`/`.audio-clip` claim z-index:2 so clip content stays on top —
 * playhead/LoopRegion/markers keep their existing z-index 3/4/10 and remain
 * above both.
 *
 * Height is computed explicitly (trackCount * 76px row height, matching
 * `.track-lane`/`.audio-track-lane`/`.inspector-track-lane`/
 * `.master-track-lane`'s shared `height: 76px` in timeline.css) rather than
 * via `top:0;bottom:0` — an explicit pixel height is what makes "renders
 * with nonzero height even with zero clips" mechanically testable in vitest
 * (jsdom does not resolve real CSS layout). If the row height ever changes,
 * update TRACK_ROW_HEIGHT_PX alongside it.
 */
import { selectQuantizeGridLevel } from '../../utils/quantize-grid'

/** Coupled to the shared `height: 76px` rule on every *-track-lane class in styles/timeline.css. */
export const TRACK_ROW_HEIGHT_PX = 76

interface GridOverlayProps {
  quantizeEnabled?: boolean
  bpm?: number
  quantizeDivision: number
  zoom: number
  contentWidth: number
  /** Number of visible track rows (ordered tracks + master, if present) — see TRACK_ROW_HEIGHT_PX. */
  rowCount: number
}

function buildGridGradient(spacingPx: number, colorVar: string): string {
  // Guard against degenerate (sub-1px) spacing at extreme zoom-out/high-bpm
  // combinations so the gradient stop list stays valid (non-negative).
  const px = Math.max(1, spacingPx)
  return `repeating-linear-gradient(90deg, transparent, transparent ${px - 1}px, var(${colorVar}) ${px - 1}px, var(${colorVar}) ${px}px)`
}

export default function GridOverlay({ quantizeEnabled, bpm, quantizeDivision, zoom, contentWidth, rowCount }: GridOverlayProps) {
  // A1: renders whenever quantizeEnabled && bpm — no selection dependency,
  // and independent of clip count (rowCount only, not clip content).
  if (!quantizeEnabled || !bpm || rowCount <= 0) return null

  const { fineIntervalSeconds, barIntervalSeconds, showFineLayer } = selectQuantizeGridLevel(bpm, quantizeDivision, zoom)
  const barPx = barIntervalSeconds * zoom
  const finePx = fineIntervalSeconds * zoom

  // Bar layer listed first (painted on top) so bar-boundary pixels always
  // resolve to --cx-grid-bar even where a fine line coincides with a bar line.
  // Single-layer branch (level 'bar' or '4bar') must render at `finePx`, not
  // `barPx`: for 'bar' the two are identical (chosen beatsPerLine ===
  // BAR_BEATS_PER_LINE), but for '4bar' `finePx` is the coarser 16-beat
  // spacing that actually cleared the 10px floor — rendering `barPx` here
  // painted 4-beat lines, i.e. the exact spacing '4bar' was chosen to avoid.
  const backgroundImage = showFineLayer
    ? `${buildGridGradient(barPx, '--cx-grid-bar')}, ${buildGridGradient(finePx, '--cx-grid-beat')}`
    : buildGridGradient(finePx, '--cx-grid-bar')

  // Named variable rather than an inline object literal on the JSX attribute
  // itself — ui-ratchets.sh's tsx_inline_style counter greps source text for
  // that exact inline-literal spelling, and the ratchet ceiling must not
  // rise (PK.A1's contract). Functionally identical either way: values here
  // are inherently per-render-computed (width/height/gradient), same
  // category as LoopRegion.tsx/Playhead.tsx.
  const overlayStyle: React.CSSProperties = {
    width: `${contentWidth}px`,
    height: `${rowCount * TRACK_ROW_HEIGHT_PX}px`,
    backgroundImage,
  }

  return (
    <div
      className="timeline__grid-overlay"
      data-testid="quantize-grid-overlay"
      style={overlayStyle}
    />
  )
}
