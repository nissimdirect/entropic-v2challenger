/**
 * quantize-grid.ts — W1.5b Workstream A: pure grid math for the quantize
 * grid system (openspec/changes/w15b-grid-track-paradigm).
 *
 * Single source of truth for quantize division labels, the LOD level
 * selection (PK.A2), and the status-bar readout string (PK.A3), so
 * Timeline.tsx's GridOverlay and layout/QuantizeReadout.tsx can never drift
 * apart on what "1/16 · bar 2.0s @ 120" means.
 */

/** Quantize divisions exposed in the UI (denominator of a whole note). */
export const QUANT_DIVISIONS = [1, 2, 4, 8, 16, 32] as const

export const QUANT_LABELS: Record<number, string> = {
  1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32',
}

export type GridLevelName = 'division' | 'beat' | 'bar' | '4bar'

interface Candidate {
  name: GridLevelName
  /** Beats between adjacent lines at this level (4/4 time assumed, matching
   *  the pre-existing bar-length math: 4 beats/bar). */
  beatsPerLine: number
}

/** Beats-per-line for the level that is always a bar (used as the "stronger
 *  color" layer regardless of which level ends up being the fine layer). */
const BAR_BEATS_PER_LINE = 4

/** Fixed candidate levels, independent of the user's chosen division. */
const FIXED_CANDIDATES: Candidate[] = [
  { name: 'beat', beatsPerLine: 1 },
  { name: 'bar', beatsPerLine: BAR_BEATS_PER_LINE },
  { name: '4bar', beatsPerLine: 16 },
]

export interface QuantizeGridResult {
  /** The finest level whose on-screen line spacing clears the pixel floor
   *  (or the coarsest candidate, if none do — the grid must never vanish). */
  level: GridLevelName
  /** Seconds between lines at the chosen (fine) level. */
  fineIntervalSeconds: number
  /** Seconds between bar lines — always computed so the stronger
   *  `--cx-grid-bar` layer can render even when the fine layer is finer. */
  barIntervalSeconds: number
  /** True when the chosen level is strictly finer than a bar (division or
   *  beat) — the caller should stack a second, finer layer under the bar
   *  layer. False when the chosen level IS bar/4bar (a single layer). */
  showFineLayer: boolean
}

/**
 * PK.A2 — LOD coarsening. Replaces the old `if (gridPx < 10) return {}`
 * cliff (pre-W1.5b Timeline.tsx) with a coarsen-not-vanish rule: pick the
 * finest of {division, beat, bar, 4bar} whose pixel spacing >= minSpacingPx;
 * if even 4bar falls under the floor, use 4bar anyway.
 */
export function selectQuantizeGridLevel(
  bpm: number,
  quantizeDivision: number,
  zoom: number,
  minSpacingPx = 10,
): QuantizeGridResult {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const secondsPerBeat = 60 / safeBpm

  const divisionBeatsPerLine = Number.isFinite(quantizeDivision) && quantizeDivision > 0
    ? 4 / quantizeDivision
    : 1

  // Build the candidate list, finest first, de-duping exact spacing ties
  // (e.g. quantizeDivision === 4 makes 'division' identical to 'beat' — the
  // user-facing division name wins the tie).
  const seen = new Set<number>()
  const candidates: Candidate[] = []
  for (const c of [{ name: 'division' as const, beatsPerLine: divisionBeatsPerLine }, ...FIXED_CANDIDATES]) {
    if (seen.has(c.beatsPerLine)) continue
    seen.add(c.beatsPerLine)
    candidates.push(c)
  }
  candidates.sort((a, b) => a.beatsPerLine - b.beatsPerLine)

  // Fallback: coarsest candidate — the grid must never fully disappear.
  let chosen = candidates[candidates.length - 1]
  for (const c of candidates) {
    const spacingPx = c.beatsPerLine * secondsPerBeat * safeZoom
    if (spacingPx >= minSpacingPx) {
      chosen = c
      break
    }
  }

  return {
    level: chosen.name,
    fineIntervalSeconds: chosen.beatsPerLine * secondsPerBeat,
    barIntervalSeconds: BAR_BEATS_PER_LINE * secondsPerBeat,
    showFineLayer: chosen.beatsPerLine < BAR_BEATS_PER_LINE,
  }
}

/** PK.A3 — status-bar readout, e.g. "1/16 · bar 2.0s @ 120". Bar length
 *  assumes 4/4 time: 4 beats/bar * (60/bpm) seconds/beat. */
export function formatQuantizeReadout(bpm: number, quantizeDivision: number): string {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120
  const barSeconds = (60 / safeBpm) * BAR_BEATS_PER_LINE
  const label = QUANT_LABELS[quantizeDivision] ?? `1/${quantizeDivision}`
  return `${label} · bar ${barSeconds.toFixed(1)}s @ ${Math.round(safeBpm)}`
}

/**
 * PK.A4 — snap a raw timeline-seconds position to the CURRENTLY VISIBLE grid
 * level (whatever selectQuantizeGridLevel/PK.A2 is rendering at this zoom —
 * "snap in/out to active grid level", proposal.md Workstream A). Deliberately
 * distinct from Clip.tsx's snapPosition (which also considers clip edges/
 * playhead/markers via the separate `snapEnabled` toggle) — this is quantize-
 * grid-only, matching what the user can actually see.
 */
export function snapTimeToGridLevel(
  time: number,
  bpm: number,
  quantizeDivision: number,
  zoom: number,
): number {
  const { fineIntervalSeconds } = selectQuantizeGridLevel(bpm, quantizeDivision, zoom)
  if (!Number.isFinite(fineIntervalSeconds) || fineIntervalSeconds <= 0) return time
  return Math.round(time / fineIntervalSeconds) * fineIntervalSeconds
}
