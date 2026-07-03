import type { AutomationLane, AutomationPoint, BlendOp, InterpolationMode } from '../../shared/types'

export type { BlendOp } from '../../shared/types'

/**
 * PR-B Commit-1: a lane is a "trigger" lane iff its mode fires events
 * (gate/oneShot). Replaces the old `isTrigger` boolean check everywhere.
 */
export function isTriggerLane(lane: { mode: InterpolationMode }): boolean {
  return lane.mode === 'gate' || lane.mode === 'oneShot'
}

/**
 * AA.2 — a lane is a "modulation" lane iff `kind === 'modulation'`. Absent
 * (undefined) === 'absolute', matching AutomationLaneKind's back-compat
 * contract in shared/types.ts.
 */
export function isModulationLane(lane: { kind?: string }): boolean {
  return lane.kind === 'modulation'
}

// AA.2 — modulation lanes always render in a fixed distinct color (Ableton
// blue-vs-red convention: absolute lanes keep their cycling LANE_COLORS
// default-green-first palette, modulation lanes are always this blue),
// regardless of how many lanes already exist on the track. Shared by
// AutomationLane.tsx (SVG curve/node color) and AutomationToolbar.tsx (the
// "+ Mod" picker + inline blendOp list swatches).
export const MODULATION_LANE_COLOR = '#3b82f6'

/**
 * AA.2 — combine a modulation contribution onto an accumulator value.
 * 'add' is the default/identity-preserving op (matches the backend
 * routing.py blend default). Pure, no clamping — callers clamp the final
 * composed result (see composeModulatedValue below).
 */
export function applyBlendOp(base: number, modValue: number, op: BlendOp = 'add'): number {
  switch (op) {
    case 'multiply':
      return base * modValue
    case 'max':
      return Math.max(base, modValue)
    case 'add':
    default:
      return base + modValue
  }
}

/**
 * AA.2 — compose a parameter's final NORMALIZED ([0,1]-space) value from its
 * absolute lane's evaluated value plus every modulation lane superimposed on
 * the same paramPath, in lane-array order.
 *
 * - `baseValue`: the armed/absolute lane's evaluateAutomation() result at
 *   this time, or `null` when no absolute lane exists on the param (or its
 *   points array is empty).
 * - `modContributions`: already-evaluated (non-null, finite) modulation lane
 *   values + their blendOp, in lane-array order. Same-domain filtering
 *   (t-domain mod onto a t-domain base, etc.) is the CALLER's job — see
 *   evaluateAutomationOverrides.ts's cross-domain TODO.
 *
 * Fallback when there's no absolute lane but modulation lanes exist: the
 * FIRST modulation lane's own value seeds the accumulator (so a modulation
 * lane can drive a param standalone — useful before an absolute lane is ever
 * drawn) and any additional modulation lanes fold onto it in order.
 *
 * Returns `null` only when there is neither a base value nor any modulation
 * contributions (mirrors evaluateAutomation's "no override" null).
 *
 * Back-compat: when `modContributions` is empty, `baseValue` is returned
 * UNCHANGED (no clamp) — this is what makes a no-modulation-lanes project
 * evaluate byte-identical to pre-AA.2 behavior, even for out-of-[0,1]-range
 * points that pre-AA.2 code never clamped either.
 */
export function composeModulatedValue(
  baseValue: number | null,
  modContributions: Array<{ value: number; blendOp: BlendOp }>,
): number | null {
  if (modContributions.length === 0) return baseValue

  let acc: number
  let rest: Array<{ value: number; blendOp: BlendOp }>
  if (baseValue !== null) {
    acc = baseValue
    rest = modContributions
  } else {
    acc = modContributions[0].value
    rest = modContributions.slice(1)
  }

  for (const mod of rest) {
    acc = applyBlendOp(acc, mod.value, mod.blendOp)
  }

  // Clamp to the normalized [0,1] lane-value space — modulation can push the
  // composed value outside the drawn 0-1 range (e.g. 0.9 add 0.5 = 1.4).
  // denormalize() below maps this into the param's actual [min,max], so this
  // clamp IS "clamp to the param's range" one layer early (normalized space).
  // evaluateAutomationOverrides.ts also clamps the denormalized result as a
  // belt-and-suspenders guard for inverted/unusual [min,max] registries.
  if (!Number.isFinite(acc)) return baseValue ?? 0
  return Math.max(0, Math.min(1, acc))
}

/**
 * Apply easing curve to a normalized t value (0-1).
 * curve=0 linear, curve>0 ease-out, curve<0 ease-in.
 */
export function applyEasing(t: number, curve: number): number {
  if (curve === 0) return t
  if (curve > 0) return 1 - Math.pow(1 - t, 1 + curve * 2)
  return Math.pow(t, 1 + Math.abs(curve) * 2)
}

/**
 * Evaluate an automation lane at a given time.
 * Returns null if the lane has no points (no override).
 * Uses O(log n) binary search for surrounding points.
 */
export function evaluateAutomation(lane: AutomationLane, time: number): number | null {
  const { points } = lane
  if (points.length === 0) return null
  if (points.length === 1) return points[0].value

  // Before first point
  if (time <= points[0].time) return points[0].value
  // After last point
  if (time >= points[points.length - 1].time) return points[points.length - 1].value

  // Binary search for the segment containing `time`
  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const a: AutomationPoint = points[lo]
  const b: AutomationPoint = points[hi]

  // PR-B Commit-1: 'step' mode holds the left point's value (no interpolation).
  if (lane.mode === 'step') return a.value

  // Zero-duration segment — return first point's value
  const duration = b.time - a.time
  if (duration === 0) return a.value

  const t = (time - a.time) / duration
  const eased = applyEasing(t, a.curve)
  return a.value + (b.value - a.value) * eased
}

/** Map a normalized 0-1 value to a parameter range. */
export function denormalize(normalized: number, min: number, max: number): number {
  return min + normalized * (max - min)
}

/**
 * AA.6 — Ableton-parity "is this param automated" check (§25.1).
 * Pure/read-only: true iff `lanes` contains a lane whose paramPath matches
 * and which has at least one recorded point. An empty lane (created but
 * never drawn/recorded into) does NOT count as "active" automation.
 */
export function isParamAutomated(paramPath: string, lanes: AutomationLane[]): boolean {
  return lanes.some((lane) => lane.paramPath === paramPath && lane.points.length >= 1)
}
