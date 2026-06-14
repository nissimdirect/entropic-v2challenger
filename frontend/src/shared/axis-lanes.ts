/**
 * P6.6 — Build the `axis_lanes` render-payload entries from automation lanes
 * whose `axisBinding.domain` is 'y' or 'x'.
 *
 * Backend contract (VERIFIED `backend/src/engine/pipeline.py` + `test_field_eval.py`):
 * each entry is snake_case:
 *   {
 *     effect_id: string,   // from lane.paramPath "effectId.paramKey"
 *     param: string,
 *     curve: number[],     // dense sampled value profile along the axis
 *     domain: 'y' | 'x',
 *     direction: number,
 *     interp_mode: 'linear' | 'step' | 'cubic' | 'cosine',
 *     loop_mode: 'off',
 *     n_bands: number,
 *   }
 *
 * The backend samples `curve` along the spatial axis (band centres in [0,1]
 * index into the array) and produces one scalar per band. We therefore sample
 * the lane's normalized value profile into a dense array.
 *
 * Rules (P6.6):
 *  - Only 'y'/'x' domains produce entries. 't'/absent → omitted (T stays in
 *    automation_overrides). Other axes (c/f/l) are not yet renderable → omitted.
 *  - Hidden lanes are omitted (consistent with evaluateAutomationOverrides).
 *  - A lane with an EMPTY curve (no points) is omitted entirely — never send `[]`.
 *  - All curve values are finite-guarded (NaN/Inf dropped to 0).
 */
import type { AutomationLane } from './types'

/** Dense sample count for the curve array sent to the backend. */
export const AXIS_LANE_CURVE_SAMPLES = 64

/** Band count the backend divides the axis into (default; backend clamps [2,128]). */
export const AXIS_LANE_N_BANDS = 32

export interface SerializedAxisLane {
  effect_id: string
  param: string
  curve: number[]
  domain: 'y' | 'x'
  direction: number
  interp_mode: 'linear' | 'step' | 'cubic' | 'cosine'
  loop_mode: 'off'
  n_bands: number
}

/**
 * Sample a lane's value profile into a dense `number[]` of length `samples`.
 *
 * The lane's points carry `value` in normalized [0,1] and `time` ordinates. We
 * sample across the lane's own time span (first→last point) so the spatial
 * profile mirrors the drawn curve shape. Single-point / empty lanes return a
 * flat array (or empty for zero points, which the caller drops).
 *
 * Finite-guarded: any non-finite sample collapses to 0.
 */
export function sampleLaneCurve(
  lane: AutomationLane,
  samples = AXIS_LANE_CURVE_SAMPLES,
): number[] {
  const points = lane.points
  if (!points || points.length === 0) return []
  if (points.length === 1) {
    const v = Number.isFinite(points[0].value) ? points[0].value : 0
    return new Array(samples).fill(v)
  }

  const t0 = points[0].time
  const t1 = points[points.length - 1].time
  const span = t1 - t0
  const out: number[] = new Array(samples)

  for (let i = 0; i < samples; i++) {
    const u = samples === 1 ? 0 : i / (samples - 1)
    const t = span > 0 ? t0 + u * span : t0
    out[i] = sampleStepLinear(lane, t)
  }
  return out
}

/**
 * Sample the lane's piecewise curve at absolute time `t` using the lane's
 * `mode` (only 'step' vs interpolated matters for the spatial profile; gate/
 * oneShot lanes fall back to held-value interpolation here — axis lanes are a
 * spatial profile, not a trigger envelope). Local linear interp with per-segment
 * easing curve, matching `automation-evaluate.ts` semantics.
 */
function sampleStepLinear(lane: AutomationLane, t: number): number {
  const points = lane.points
  if (t <= points[0].time) return guard(points[0].value)
  if (t >= points[points.length - 1].time) return guard(points[points.length - 1].value)

  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= t) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  if (lane.mode === 'step') return guard(a.value)
  const duration = b.time - a.time
  if (duration === 0) return guard(a.value)
  const localT = (t - a.time) / duration
  const eased = applyEasing(localT, a.curve)
  return guard(a.value + (b.value - a.value) * eased)
}

function applyEasing(t: number, curve: number): number {
  if (curve === 0) return t
  if (curve > 0) return 1 - Math.pow(1 - t, 1 + curve * 2)
  return Math.pow(t, 1 + Math.abs(curve) * 2)
}

function guard(v: number): number {
  return Number.isFinite(v) ? v : 0
}

/**
 * Build the `axis_lanes` payload array from all lanes.
 *
 * Returns an array (possibly empty). The caller should attach it to the render
 * payload only when non-empty (don't bloat every render IPC with `[]`).
 */
export function buildAxisLanes(lanes: AutomationLane[]): SerializedAxisLane[] {
  const out: SerializedAxisLane[] = []
  for (const lane of lanes) {
    if (!lane.isVisible) continue
    const binding = lane.axisBinding
    if (!binding) continue
    if (binding.domain !== 'y' && binding.domain !== 'x') continue

    // paramPath = "${effectId}.${paramKey}". Effect ids themselves contain dots
    // (e.g. "fx.glow"), so split on the LAST dot: effectId="fx.glow", param="intensity".
    const dotIdx = lane.paramPath.lastIndexOf('.')
    if (dotIdx === -1) continue
    const effectId = lane.paramPath.slice(0, dotIdx)
    const param = lane.paramPath.slice(dotIdx + 1)
    if (!effectId || !param) continue

    const curve = sampleLaneCurve(lane)
    // Omit entries with an empty curve — never emit `curve: []`.
    if (curve.length === 0) continue

    out.push({
      effect_id: effectId,
      param,
      curve,
      domain: binding.domain,
      direction: 1.0,
      interp_mode: 'linear',
      loop_mode: 'off',
      n_bands: AXIS_LANE_N_BANDS,
    })
  }
  return out
}
