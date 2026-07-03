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
import type { AutomationLane, BlendOp, EffectInfo, EffectInstance, Track } from '../../shared/types'
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

/**
 * #28 fix — a `paramPath` is `"${effectId}.${paramKey}"`, but `effectId` can be
 * EITHER of two distinct keying schemes in play across the codebase:
 *   - INSTANCE-keyed: every current lane-creation UI path (Track.tsx,
 *     DeviceCard.tsx, ParamPanel.tsx, AutomationToolbar.tsx, retro-capture.ts)
 *     composes `${effect.id}.${key}` where `effect.id` is the EffectInstance's
 *     instance uuid — NOT a registry key. The registry is keyed by TYPE
 *     (EffectInfo.id, e.g. "fx.hue_shift"), so resolving these requires
 *     walking the chain/track context to find the instance and read its
 *     `.effectId` (the type id) back out.
 *   - TYPE-keyed: the shared/axis-lanes.ts:136 convention — some paramPaths
 *     address the registry TYPE id directly (type ids themselves contain
 *     dots, e.g. "fx.hue_shift.amount"), so that scheme is only resolvable by
 *     splitting on the LAST dot, not the first.
 * Builds an instance-id -> effect-TYPE-id map from every track's effectChain
 * (walked once per evaluateAutomationOverrides call, not per lane/group).
 */
function buildInstanceEffectTypeMap(tracks: Track[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const track of tracks) {
    for (const instance of track.effectChain) {
      map.set(instance.id, instance.effectId)
    }
  }
  return map
}

/**
 * Resolve a paramPath's real [min,max] bounds from the registry, trying BOTH
 * keying schemes (see buildInstanceEffectTypeMap's doc comment):
 *   1. INSTANCE-keyed: first-dot split -> instance id -> tracks context ->
 *      effect TYPE id -> registry.
 *   2. TYPE-keyed: last-dot split -> effect TYPE id -> registry directly
 *      (matches shared/axis-lanes.ts:136; also covers the common case where
 *      the registry id itself has zero or one dot, e.g. tests' "fx-1", since
 *      first-dot and last-dot coincide there).
 * Returns `found: false` (and the caller falls back to [0,1]) only when
 * NEITHER scheme resolves a real registry param — i.e. the param is
 * genuinely absent from the registry (back-compat guarantee: unresolvable
 * paramPaths, like `projectParam.bpm` or `clipTransform.<id>.<field>`, keep
 * the exact pre-#28 [0,1] default behavior).
 */
function resolveParamBounds(
  paramPath: string,
  registry: EffectInfo[],
  instanceEffectType: Map<string, string>,
): { pMin: number; pMax: number; found: boolean } {
  const firstDot = paramPath.indexOf('.')
  const lastDot = paramPath.lastIndexOf('.')

  // Scheme 1 — instance-keyed (first dot).
  if (firstDot !== -1) {
    const instanceId = paramPath.slice(0, firstDot)
    const paramKey = paramPath.slice(firstDot + 1)
    const effectTypeId = instanceEffectType.get(instanceId)
    if (effectTypeId !== undefined) {
      const effectInfo = registry.find((r) => r.id === effectTypeId)
      const paramDef = effectInfo?.params[paramKey]
      if (paramDef) {
        return { pMin: paramDef.min ?? 0, pMax: paramDef.max ?? 1, found: true }
      }
    }
  }

  // Scheme 2 — type-keyed (last dot; also the single-dot common case).
  if (lastDot !== -1) {
    const effectTypeId = paramPath.slice(0, lastDot)
    const paramKey = paramPath.slice(lastDot + 1)
    const effectInfo = registry.find((r) => r.id === effectTypeId)
    const paramDef = effectInfo?.params[paramKey]
    if (paramDef) {
      return { pMin: paramDef.min ?? 0, pMax: paramDef.max ?? 1, found: true }
    }
  }

  return { pMin: 0, pMax: 1, found: false }
}

export function evaluateAutomationOverrides(
  lanes: AutomationLane[],
  time: number,
  registry: EffectInfo[],
  tracks: Track[] = [],
): Record<string, number> {
  const overrides: Record<string, number> = {}
  const groups = new Map<string, ParamGroup>()
  const instanceEffectType = buildInstanceEffectTypeMap(tracks)

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

    // paramPath = "effectId.paramKey" — malformed (no dot at all) paramPaths
    // are dropped, unchanged from pre-#28 behavior.
    if (group.paramPath.indexOf('.') === -1) continue

    // #28 — look up REAL param bounds, trying both the instance-keyed and
    // type-keyed schemes (see resolveParamBounds's doc comment). Only falls
    // back to [0,1] when the param is genuinely absent from the registry.
    const { pMin, pMax } = resolveParamBounds(group.paramPath, registry, instanceEffectType)

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

/**
 * M.3 (Master-Out Bus PRD) — apply resolved automation overrides directly
 * onto a chain's effect params, pure/non-mutating (returns a new array; the
 * input chain and its effect objects are untouched — same clone contract as
 * applyPadModulations.ts).
 *
 * Why this exists: `master_chain` (App.tsx buildMasterChainPayload call
 * sites) is serialized and sent as a STATIC snapshot of the Master track's
 * effectChain — there is no backend `automation_overrides` handling on the
 * render_composite seam the way render_frame has (Phase 7,
 * zmq_server.py:750). Track effect automation in the composite/multi-layer
 * path is a separate pre-existing gap (out of scope here — PRD is Master-only).
 * For the MASTER chain specifically, baking the override values into the
 * params BEFORE serialization reuses the exact same evaluator
 * (evaluateAutomationOverrides) both preview and export already call through
 * — no parallel override mechanism, no backend change needed for the preview
 * seam. `overrides` is `undefined`/empty → the chain is returned unchanged
 * (byte-identical to pre-M.3, same no-op contract as the rest of the render
 * path).
 *
 * Key convention — deliberately `effect.effectId` (the effect TYPE, e.g.
 * "fx.color_invert"), NOT `effect.id` (the per-instance uuid): the EXPORT
 * side of this same override (automation_by_frame, resolved backend-side by
 * modulation/engine.py's `apply_modulation`) matches chain entries by the
 * serialized `effect_id` field, which is ALWAYS the type
 * (ipc-serialize.ts's `serializeEffectInstance` never puts the instance id on
 * the wire — see `SerializedEffectInstance`). Matching by `effect.id` here
 * would make the value apply in preview (this function runs pre-serialization
 * and could match on anything) but silently NOT apply in export (the backend
 * has no instance id to match against) — a preview/export drift the PRD's
 * hard oracle explicitly forbids. So paramPaths for MASTER automation lanes
 * MUST be built as `${effect.effectId}.${paramKey}` (see MasterTrack.tsx),
 * and this function matches the same way, keeping both sides on the one
 * key convention the backend can actually resolve. (NOTE: this differs from
 * Track.tsx's per-track "Add Lane" menu, which keys by `effect.id` — that is
 * a separate, pre-existing convention for per-track lanes not touched by
 * this packet; scoped strictly to master here.)
 */
export function applyAutomationOverridesToChain(
  chain: EffectInstance[],
  overrides: Record<string, number> | undefined,
): EffectInstance[] {
  if (!overrides || Object.keys(overrides).length === 0) return chain
  return chain.map((effect) => {
    let changed = false
    const parameters = { ...effect.parameters }
    for (const paramKey of Object.keys(parameters)) {
      const overrideKey = `${effect.effectId}.${paramKey}`
      if (!(overrideKey in overrides)) continue
      const value = overrides[overrideKey]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      parameters[paramKey] = value
      changed = true
    }
    return changed ? { ...effect, parameters } : effect
  })
}
