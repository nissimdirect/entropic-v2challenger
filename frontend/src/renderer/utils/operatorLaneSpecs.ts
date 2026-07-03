/**
 * AA.3-A — operator-sourced automation lanes: the parity seam.
 *
 * Two pure functions used by BOTH preview (App.tsx requestRenderFrame) AND
 * export bake (App.tsx's export-payload builder) — mirrors how
 * evaluateAutomationOverrides.ts is the single choke point AA.2 shares
 * between preview and export. Building the operator-lane payloads in exactly
 * ONE place is what makes preview and export structurally identical
 * (docs/plans/2026-07-03-aa3-live-generators-spec.md §2.3): both send the
 * SAME synthetic operators + specs + base map to the backend's
 * evaluate_all/apply_modulation seam.
 */
import type { AutomationLane, BlendOp, EffectInfo } from '../../shared/types'
import type { Axis } from '../../shared/axis-binding'
import { evaluateAutomation, isModulationLane, composeModulatedValue } from './automation-evaluate'

/**
 * Matches the shape operators.ts's getSerializedOperators() produces —
 * spreadable directly into the same `operators` IPC array
 * (`[...serializedOps, ...buildSyntheticLaneOperators(lanes)]`).
 */
export interface SerializedLaneOperator {
  id: string
  type: string
  is_enabled: boolean
  parameters: Record<string, number | string>
  processing: unknown[]
  mappings: unknown[]
}

export interface OperatorLaneSpec {
  param_path: string
  operator_id: string
  blend_op: BlendOp
  depth: number
  min: number
  max: number
}

/**
 * The synthetic operator id namespace. Real operator ids are
 * `op-${Date.now()}-${n}` (operators.ts) and lane ids are `auto-`/`mod-`/
 * `trig-` prefixed (automation.ts) — neither ever starts with `__lane__`, so
 * this prefix can't collide with a real operator id.
 */
export function laneOperatorId(laneId: string): string {
  return `__lane__${laneId}`
}

/**
 * One synthetic, mapping-less operator per visible `source:'operator'`,
 * `domain:'t'` lane — appended to the `operators` IPC payload (alongside the
 * real operator-rack operators) so the backend's EXISTING evaluate_all
 * computes its per-frame value for free (LFO/audio-follower state, audio PCM,
 * the render-budget guard — all reused, nothing new backend-side). Because
 * `mappings:[]`, resolve_routings (routing.py:237) iterates zero mappings for
 * it — it never modulates a param via the routing channel; it exists only to
 * be READ by resolve_operator_lanes.
 *
 * A lane whose `axisBinding.domain` isn't `'t'` is skipped (spatial operator
 * lanes are scoped OUT of AA.3 — spec §3.2/§7; the field-destination path
 * they'd need is unshipped, gated behind EXPERIMENTAL_FIELD_DST).
 */
export function buildSyntheticLaneOperators(lanes: AutomationLane[]): SerializedLaneOperator[] {
  const ops: SerializedLaneOperator[] = []
  for (const lane of lanes) {
    if (!lane.isVisible) continue
    if (lane.source !== 'operator' || !lane.operator) continue
    const domain: Axis = lane.axisBinding?.domain ?? 't'
    if (domain !== 't') continue

    ops.push({
      id: laneOperatorId(lane.id),
      type: lane.operator.type,
      is_enabled: true,
      parameters: lane.operator.params,
      processing: [],
      mappings: [],
    })
  }
  return ops
}

/**
 * Build the constant per-lane descriptors (`specs`) + the per-frame
 * NORMALIZED base map (`baseNormalized`) for every operator-sourced lane.
 *
 * `specs` is constant across time (the descriptor never changes frame to
 * frame) — `time` is only needed for `baseNormalized`, kept as a parameter
 * for signature symmetry with evaluateAutomationOverrides(lanes, time, registry).
 * `registry` is accepted for the SAME symmetry but unused here — unlike
 * evaluateAutomationOverrides, this stays in NORMALIZED [0,1] space; the
 * denormalize + registry-bounds lookup happens backend-side
 * (routing.resolve_operator_lanes), which is the ONLY place PREVIEW and
 * EXPORT both actually call.
 *
 * `baseNormalized[paramPath]` mirrors evaluateAutomationOverrides.ts's own
 * grouping (last visible absolute lane wins, drawn same-domain modulation
 * lanes fold onto it via composeModulatedValue) — but restricted to the
 * paramPaths that carry an operator lane, and computed from ONLY the DRAWN
 * lanes sharing that paramPath (an operator-source lane never contributes to
 * another paramPath's base — AA.3 folds operator mods AFTER drawn mods,
 * spec §7 "documented ordering, not a bug").
 */
export function buildOperatorLaneSpecs(
  lanes: AutomationLane[],
  time: number,
  registry: EffectInfo[],
): { specs: OperatorLaneSpec[]; baseNormalized: Record<string, number | null> } {
  void registry // signature symmetry only — see doc comment above

  const specs: OperatorLaneSpec[] = []
  const operatorLaneParamPaths = new Set<string>()

  for (const lane of lanes) {
    if (!lane.isVisible) continue
    if (lane.source !== 'operator' || !lane.operator) continue
    const domain: Axis = lane.axisBinding?.domain ?? 't'
    if (domain !== 't') continue // mirrors buildSyntheticLaneOperators's guard

    operatorLaneParamPaths.add(lane.paramPath)
    const op = lane.operator
    specs.push({
      param_path: lane.paramPath,
      operator_id: laneOperatorId(lane.id),
      blend_op: lane.blendOp ?? 'add',
      depth: Number.isFinite(op.depth) ? (op.depth as number) : 1,
      min: Number.isFinite(op.min) ? (op.min as number) : 0,
      max: Number.isFinite(op.max) ? (op.max as number) : 1,
    })
  }

  const baseNormalized: Record<string, number | null> = {}
  if (operatorLaneParamPaths.size === 0) {
    return { specs, baseNormalized }
  }

  interface DrawnGroup {
    absoluteValue: number | null
    domain: Axis
    mods: Array<{ value: number; blendOp: BlendOp; domain: Axis }>
  }
  const groups = new Map<string, DrawnGroup>()

  for (const lane of lanes) {
    if (!lane.isVisible) continue
    if (lane.source === 'operator') continue // excluded from base composition
    if (!operatorLaneParamPaths.has(lane.paramPath)) continue

    const normalized = evaluateAutomation(lane, time)
    if (normalized === null || !Number.isFinite(normalized)) continue

    const laneDomain: Axis = lane.axisBinding?.domain ?? 't'
    let group = groups.get(lane.paramPath)
    if (!group) {
      group = { absoluteValue: null, domain: laneDomain, mods: [] }
      groups.set(lane.paramPath, group)
    }

    if (isModulationLane(lane)) {
      group.mods.push({ value: normalized, blendOp: lane.blendOp ?? 'add', domain: laneDomain })
    } else {
      // Absolute lane — last one wins (mirrors evaluateAutomationOverrides.ts's
      // verbatim pre-AA.2 overwrite semantics), re-anchoring the group's domain.
      group.absoluteValue = normalized
      group.domain = laneDomain
    }
  }

  for (const paramPath of operatorLaneParamPaths) {
    const group = groups.get(paramPath)
    if (!group) {
      baseNormalized[paramPath] = null
      continue
    }
    const mods = group.mods.filter((m) => m.domain === group.domain)
    baseNormalized[paramPath] = composeModulatedValue(group.absoluteValue, mods)
  }

  return { specs, baseNormalized }
}
