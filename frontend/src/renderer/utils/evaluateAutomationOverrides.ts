/**
 * Evaluate all automation lanes at a given time, returning override values.
 * Pure function — no side effects.
 *
 * Returns Record<string, number> where key = "effectId.paramKey"
 * and value = denormalized parameter value.
 *
 * AA.2 — modulation lane composition. This is the SINGLE choke point both
 * preview (App.tsx requestRenderFrame) and export baking (App.tsx's
 * automation_by_frame pre-resolution loop) call through, so blending here
 * gives export/preview parity for free — no second backend compositor.
 * Per-paramPath: the LAST visible absolute (kind !== 'modulation') lane in
 * array order wins as the base value (this is the exact pre-AA.2 "last lane
 * wins" overwrite behavior — preserved verbatim for back-compat), then every
 * visible modulation lane sharing that paramPath folds onto it in array
 * order via its blendOp (composeModulatedValue in automation-evaluate.ts).
 */
import type { AutomationLane, BlendOp, EffectInfo } from '../../shared/types'
import type { Axis } from '../../shared/axis-binding'
import { evaluateAutomation, denormalize, isModulationLane, composeModulatedValue } from './automation-evaluate'

interface ParamGroup {
  paramPath: string
  /** Last visible absolute lane's evaluated normalized value, or null if none. */
  absoluteValue: number | null
  /** Domain of the group's base — the (last-wins) absolute lane's
   *  axisBinding.domain, or (when no absolute lane exists at all) the first
   *  modulation lane's own domain. Used to gate cross-domain modulation
   *  below — filtered at the END once every lane in the group has been
   *  visited, so an absolute lane arriving AFTER some modulation lanes in
   *  array order still domain-gates them correctly. */
  domain: Axis
  mods: Array<{ value: number; blendOp: BlendOp; domain: Axis }>
}

export function evaluateAutomationOverrides(
  lanes: AutomationLane[],
  time: number,
  registry: EffectInfo[],
): Record<string, number> {
  const overrides: Record<string, number> = {}
  const groups = new Map<string, ParamGroup>()

  for (const lane of lanes) {
    if (!lane.isVisible) continue
    // AA.3 — an operator-sourced lane's per-frame value is computed
    // backend-side (resolve_operator_lanes reads it out of operator_values);
    // it must NOT also emit a frontend-evaluated denormalized REPLACE here
    // (lane.points is empty for an operator-source lane anyway, so this is
    // belt-and-suspenders — the backend owns this paramPath's operator-lane
    // contribution exclusively).
    if (lane.source === 'operator') continue

    const normalized = evaluateAutomation(lane, time)
    if (normalized === null) continue
    // Guard against NaN/Infinity
    if (!Number.isFinite(normalized)) continue

    const laneDomain: Axis = lane.axisBinding?.domain ?? 't'

    let group = groups.get(lane.paramPath)
    if (!group) {
      group = { paramPath: lane.paramPath, absoluteValue: null, domain: laneDomain, mods: [] }
      groups.set(lane.paramPath, group)
    }

    if (isModulationLane(lane)) {
      group.mods.push({ value: normalized, blendOp: lane.blendOp ?? 'add', domain: laneDomain })
    } else {
      // Absolute lane — last one wins (verbatim pre-AA.2 overwrite semantics),
      // and it also (re)anchors the group's domain, in case an absolute lane
      // appears AFTER a modulation lane in array order (domain-filtering
      // below uses the FINAL group.domain, not a snapshot taken per-lane).
      group.absoluteValue = normalized
      group.domain = laneDomain
    }
  }

  for (const group of groups.values()) {
    // AA.2 cross-domain TODO: a modulation lane whose axisBinding.domain
    // differs from the group's base domain (e.g. a t-domain absolute lane +
    // a y-domain modulation lane) would need to sample the mod lane's curve
    // per spatial band the way axis-lanes.ts's sampleLaneCurve()/
    // buildAxisLanes() does, then fold it into the backend banded render
    // rather than this scalar time-domain override. NOT IMPLEMENTED YET —
    // same-domain compose (the common case: mod lane domain matches its
    // base's domain) ships solid below; a mismatched-domain lane is simply
    // skipped here (dropped from automation_overrides — it may still render
    // independently via buildAxisLanes if it's itself y/x, unaffected by
    // this skip). blocked=false: revisit with AA.3's operator-lane work, or
    // sooner if cross-domain demand shows up — not a launch blocker for AA.2.
    const mods = group.mods.filter((m) => m.domain === group.domain)

    const composed = composeModulatedValue(group.absoluteValue, mods)
    if (composed === null) continue

    // paramPath = "effectId.paramKey"
    const dotIdx = group.paramPath.indexOf('.')
    if (dotIdx === -1) continue
    const effectId = group.paramPath.slice(0, dotIdx)
    const paramKey = group.paramPath.slice(dotIdx + 1)

    // Look up param bounds from registry
    const effectInfo = registry.find((r) => r.id === effectId)
    const paramDef = effectInfo?.params[paramKey]
    const pMin = paramDef?.min ?? 0
    const pMax = paramDef?.max ?? 1

    let value = denormalize(composed, pMin, pMax)

    // AA.2: clamp to the param's actual range when modulation contributed —
    // guarded on `mods.length > 0` so a modulation-free paramPath keeps the
    // EXACT pre-AA.2 unclamped denormalize() result (back-compat guarantee).
    if (mods.length > 0) {
      const lo = Math.min(pMin, pMax)
      const hi = Math.max(pMin, pMax)
      value = Math.max(lo, Math.min(hi, value))
    }

    // Final NaN guard
    if (!Number.isFinite(value)) continue

    overrides[group.paramPath] = value
  }

  return overrides
}
