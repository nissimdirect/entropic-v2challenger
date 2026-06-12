/**
 * P2.1 — Apply project-param modulation routes to project-level derived state.
 *
 * Companion to applyCCModulations.ts. Where applyCCModulations targets
 * effect-instance parameters, this module targets project-level parameters
 * (currently only 'bpm' → effectiveBpm).
 *
 * Usage pattern (called once per frame render cycle):
 *   1. useProjectStore.getState().resetEffectiveBpm()
 *   2. applyProjectModulations(automationLanes, currentFrame, projectStore)
 *   3. Read effectiveBpm from the store for playback-timing consumers.
 *
 * Chain (Trace Path):
 *   automation lane value @ frame → additive delta → applyBpmModulationDelta
 *   → effectiveBpm clamped [1,300] in store (never persisted)
 */

import type { AutomationLane } from '../../../shared/types'

/**
 * Evaluate all automation lanes whose paramPath targets 'projectParam.bpm' and
 * accumulate their values as additive deltas onto effectiveBpm via the store action.
 *
 * @param lanes    - Flat list of ALL automation lanes from automationStore.getAllLanes()
 * @param frame    - Current playback frame index (0-based, integer)
 * @param fps      - Project frames-per-second (used to convert frame→time for lane eval)
 * @param applyDelta - Store action: useProjectStore.getState().applyBpmModulationDelta
 */
export function applyProjectModulations(
  lanes: AutomationLane[],
  frame: number,
  fps: number,
  applyDelta: (delta: number) => void,
): void {
  if (lanes.length === 0) return
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return

  const time = frame / fps

  for (const lane of lanes) {
    if (lane.paramPath !== 'projectParam.bpm') continue
    if (!lane.isVisible) continue
    if (lane.points.length === 0) continue

    const value = evaluateLaneAtTime(lane, time)
    if (!Number.isFinite(value)) continue

    // Convention: lane value IS the BPM delta offset (not absolute BPM).
    // A lane drawn at 0 means "no change"; +20 means "add 20 BPM".
    applyDelta(value)
  }
}

/**
 * Linearly interpolate a lane's value at `time` (seconds).
 * Uses the same semantics as the existing automation lane renderer:
 * - Before first point: first point's value
 * - After last point: last point's value
 * - Between points: linear interpolation
 *
 * This is a simplified evaluator — full InterpolationMode support (smooth/step/etc.)
 * is deferred to C2/C3 (domain binding). For projectParam.bpm the 'smooth' (linear)
 * mode is the only supported mode at Tier 1.
 */
export function evaluateLaneAtTime(lane: AutomationLane, time: number): number {
  const { points } = lane
  if (points.length === 0) return 0
  if (points.length === 1) return points[0].value

  // Clamp to the lane's time range
  if (time <= points[0].time) return points[0].value
  if (time >= points[points.length - 1].time) return points[points.length - 1].value

  // Find the bracketing pair
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time
      if (span === 0) return a.value
      const t = (time - a.time) / span
      return a.value + t * (b.value - a.value)
    }
  }

  return points[points.length - 1].value
}
